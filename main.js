// Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store');
const glob = require('glob');
const sharp = require('sharp');
const removeAccents = require('remove-accents');
const fsPromises = require('fs').promises;

// Cache sharp instances for better performance
const sharpCache = new Map();

// Initialize electron store with schema
const store = new Store({
    schema: {
        lastOutputDirectory: {
            type: 'string'
        },
        suffix: {
            type: 'string',
            default: '_u'
        },
        outputFormat: {
            type: 'string',
            default: 'original'
        }
    },
    clearInvalidConfig: true
});

// Khởi tạo window chính
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f5f5f7',
      symbolColor: '#1d1d1f',
      height: 32
    },
    show: false
  });

  mainWindow.loadFile('index.html');

  // Bỏ menu mặc định
  mainWindow.setMenuBarVisibility(false);

  // Mở DevTools khi phát triển
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Clear cache on close
  mainWindow.on('closed', () => {
    sharpCache.clear();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  sharpCache.clear();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('select-output-folder', async () => {
    const lastDir = store.get('lastOutputDirectory');
    const result = await dialog.showOpenDialog(mainWindow, {
        defaultPath: lastDir || app.getPath('documents'),
        properties: ['openDirectory', 'createDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        store.set('lastOutputDirectory', result.filePaths[0]);
    }
    
    return result;
});

ipcMain.handle('get-last-directory', () => {
    return store.get('lastOutputDirectory');
});

// Mở thư mục
ipcMain.handle('open-directory', async (event, directory) => {
  try {
    await shell.openPath(directory);
    return true;
  } catch (error) {
    console.error('Error opening directory:', error);
    return false;
  }
});

// Lấy cài đặt đã lưu trước đó
ipcMain.handle('get-app-settings', () => {
  return {
    lastOutputDirectory: store.get('lastOutputDirectory', ''),
    suffix: store.get('suffix', '_u'),
    outputFormat: store.get('outputFormat', 'original')
  };
});

// Lưu cài đặt mới
ipcMain.handle('save-app-settings', (event, settings) => {
  try {
    if (settings.lastOutputDirectory) {
      store.set('lastOutputDirectory', settings.lastOutputDirectory);
    }
    if (settings.suffix !== undefined) {
      store.set('suffix', settings.suffix);
    }
    if (settings.outputFormat !== undefined) {
      store.set('outputFormat', settings.outputFormat);
    }
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
});

// Function to get nearest multiple of 4 (within 4 pixels)
function getNearestMultipleOf4(num) {
    const remainder = num % 4;
    if (remainder === 0) return num;
    
    // Get the two possible multiples of 4
    const lower = num - remainder;
    const upper = lower + 4;
    
    // If either adjustment would be more than 4 pixels, use the other one
    if (num - lower > 4) return upper;
    if (upper - num > 4) return lower;
    
    // Otherwise, use the closest one
    return (remainder < 2) ? lower : upper;
}

// Function to clean filenames
function cleanFilename(filename) {
  let clean = removeAccents(filename);
  clean = clean.replace(/\s+/g, '_');
  clean = clean.replace(/[^\w\.-]/g, '');
  return clean;
}

// Optimized image processing
ipcMain.handle('process-image', async (event, { buffer, name, outputPath, suffix, format }) => {
    try {
        await fs.ensureDir(outputPath);
        
        // Get or create sharp instance
        let image;
        const cacheKey = buffer.toString('base64').slice(0, 100); // Use first 100 chars as key
        
        if (sharpCache.has(cacheKey)) {
            image = sharpCache.get(cacheKey).clone();
        } else {
            image = sharp(Buffer.from(buffer));
            sharpCache.set(cacheKey, image.clone());
        }

        const metadata = await image.metadata();
        
        // Get dimensions that are divisible by 4 (within 4 pixels)
        const width = getNearestMultipleOf4(metadata.width);
        const height = getNearestMultipleOf4(metadata.height);

        console.log(`Processing ${name}: ${metadata.width}x${metadata.height} -> ${width}x${height}`);
        
        // Resize image to exact dimensions
        image = image.resize(width, height, {
            fit: 'fill',
            withoutEnlargement: true,
            fastShrinkOnLoad: true
        });
        
        // Set output format
        if (format !== 'original') {
            image = image.toFormat(format, {
                quality: 90,
                effort: 6
            });
        }
        
        // Generate output filename
        const ext = format === 'original' ? path.extname(name) : `.${format}`;
        const baseName = path.basename(name, path.extname(name));
        const outputName = `${baseName}${suffix}${ext}`;
        const outputFilePath = path.join(outputPath, outputName);
        
        // Save the processed image
        await image.toFile(outputFilePath);
        
        return { success: true };
    } catch (error) {
        console.error('Error processing image:', error);
        return { success: false, error: error.message };
    }
});

// Define supported formats globally
const SUPPORTED_FORMATS = ['.png', '.jpg', '.jpeg', '.psd', '.pdf', '.ai'];

// Xử lý lấy danh sách file từ thư mục
ipcMain.handle('get-files-from-folder', async (event, folderPath) => {
  try {
    const files = [];
    const processDirectory = async (dirPath) => {
      const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively process subdirectories
          await processDirectory(fullPath);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_FORMATS.includes(ext)) {
            const stats = await fsPromises.stat(fullPath);
            files.push({
              path: fullPath,
              name: entry.name,
              size: stats.size,
              type: ext.slice(1),
              isFromFolder: true
            });
          }
        }
      }
    };

    await processDirectory(folderPath);
    return files;
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

// Xử lý nhiều file ảnh
ipcMain.handle('process-images', async (event, { fileBuffers, outputDirectory, suffix, outputFormat }) => {
  try {
    let processedCount = 0;
    const totalCount = fileBuffers.length;

    // Create output directory if it doesn't exist
    await fsPromises.mkdir(outputDirectory, { recursive: true });

    // Unity texture size requirements
    const maxWidth = 2048;
    const maxHeight = 2048;

    for (const file of fileBuffers) {
      try {
        const ext = path.extname(file.path).toLowerCase();
        if (!SUPPORTED_FORMATS.includes(ext)) {
          console.warn(`Skipping unsupported file format: ${ext}`);
          continue;
        }

        // Get original image metadata
        let inputBuffer = file.buffer ? Buffer.from(file.buffer) : await fsPromises.readFile(file.path);
        const metadata = await sharp(inputBuffer).metadata();
        
        // Calculate new dimensions while maintaining aspect ratio
        let width = metadata.width;
        let height = metadata.height;
        const aspectRatio = width / height;
        
        // Check if dimensions exceed Unity's limits
        if (width > maxWidth || height > maxHeight) {
          if (width > maxWidth) {
            width = maxWidth;
            height = Math.round(width / aspectRatio);
          }
          
          if (height > maxHeight) {
            height = maxHeight;
            width = Math.round(height * aspectRatio);
          }
        }
        
        // Now make dimensions divisible by 4 while maintaining aspect ratio
        width = getNearestMultipleOf4(width);
        height = getNearestMultipleOf4(height);
        
        // Adjust one dimension to maintain exact aspect ratio
        const newAspectRatio = width / height;
        if (Math.abs(newAspectRatio - aspectRatio) > 0.01) {
          // If aspect ratio is off, adjust height based on width
          height = Math.round(width / aspectRatio);
          height = getNearestMultipleOf4(height);
        }

        // Determine output format
        const outputExt = outputFormat === 'original' ? ext : `.${outputFormat}`;
        
        // Clean and construct output filename
        const baseFilename = path.basename(file.path, ext);
        const cleanedFilename = cleanFilename(baseFilename);
        const outputFilename = path.join(
          outputDirectory,
          `${cleanedFilename}${suffix}${outputExt}`
        );

        // Process the image with explicit resize
        const sharpInstance = sharp(inputBuffer);
        
        // Resize with the calculated dimensions
        sharpInstance.resize(width, height, {
          fit: 'fill', // Use fill to force exact dimensions
          withoutEnlargement: true
        });
        
        // Save the processed image
        await sharpInstance.toFile(outputFilename);
        console.log(`Processed ${file.name}: ${metadata.width}x${metadata.height} -> ${width}x${height}`);

        processedCount++;
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }
    }

    return {
      success: true,
      processedCount,
      totalCount
    };
  } catch (error) {
    console.error('Error in batch processing:', error);
    return {
      success: false,
      error: error.message,
      processedCount: 0,
      totalCount: fileBuffers.length
    };
  }
});

ipcMain.handle('open-output-folder', async (event, folderPath) => {
    try {
        await shell.openPath(folderPath);
        return true;
    } catch (error) {
        console.error('Error opening folder:', error);
        return false;
    }
});
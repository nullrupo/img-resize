const { ipcRenderer } = require('electron');

let files = [];
let outputPath = null;

// DOM Elements
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const explicitFileBtn = document.getElementById('explicitFileBtn');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const clearAllBtn = document.getElementById('clearAllBtn');
const outputFolderBtn = document.getElementById('outputFolderBtn');
const folderPath = document.getElementById('folderPath');
const processBtn = document.getElementById('processBtn');
const statusText = document.getElementById('statusText');
const progressFill = document.getElementById('progressFill');
const completionModal = document.getElementById('completionModal');
const completionMessage = document.getElementById('completionMessage');
const openFolderBtn = document.getElementById('openFolderBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

// Initialize the app
async function initializeApp() {
    // Load last used directory
    const lastDir = await ipcRenderer.invoke('get-last-directory');
    if (lastDir) {
        outputPath = lastDir;
        folderPath.textContent = formatPath(lastDir);
        folderPath.title = lastDir;
        updateProcessButtonState();
    }
}

// Event Listeners
explicitFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
dropArea.addEventListener('dragover', handleDragOver);
dropArea.addEventListener('dragleave', handleDragLeave);
dropArea.addEventListener('drop', handleDrop);
outputFolderBtn.addEventListener('click', selectOutputFolder);
processBtn.addEventListener('click', processFiles);
openFolderBtn.addEventListener('click', openOutputFolder);
closeModalBtn.addEventListener('click', () => completionModal.classList.remove('active'));
clearAllBtn.addEventListener('click', clearAllFiles);

// Clear all files function
function clearAllFiles() {
    files = [];
    updateFileCounter();
    showFileList();
    updateProcessButtonState();
    
    // Add pulse animation to drop area
    dropArea.classList.add('pulse-animation');
    setTimeout(() => {
        dropArea.classList.remove('pulse-animation');
    }, 500);
}

// File Handling Functions
function handleFileSelect(event) {
    const newFiles = Array.from(event.target.files);
    addFiles(newFiles);
    event.target.value = ''; // Reset input
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    dropArea.classList.add('active');
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    dropArea.classList.remove('active');
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    dropArea.classList.remove('active');
    
    const items = event.dataTransfer.items;
    if (!items) return;

    const promises = [];
    for (let item of items) {
        if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                promises.push(processEntry(entry));
            }
        }
    }

    Promise.all(promises).then(() => {
        updateFileCounter();
        showFileList();
    });
}

async function processEntry(entry) {
    if (entry.isFile) {
        const file = await getFileFromEntry(entry);
        if (isFileTypeSupported(file.name)) {
            addFiles([file]);
        }
    } else if (entry.isDirectory) {
        const entries = await readDirectory(entry);
        for (let entry of entries) {
            await processEntry(entry);
        }
    }
}

function getFileFromEntry(entry) {
    return new Promise((resolve) => {
        entry.file(resolve);
    });
}

function readDirectory(dirEntry) {
    return new Promise((resolve) => {
        const reader = dirEntry.createReader();
        reader.readEntries(resolve);
    });
}

function isFileTypeSupported(filename) {
    const supportedExtensions = ['.png', '.jpg', '.jpeg', '.psd', '.pdf', '.ai'];
    return supportedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function addFiles(newFiles) {
    // Filter out unsupported files
    const supportedFiles = newFiles.filter(file => isFileTypeSupported(file.name));
    
    // Add new files to the array
    files = [...files, ...supportedFiles];
    
    updateFileCounter();
    showFileList();
    updateProcessButtonState();
}

function updateFileCounter() {
    const count = files.length;
    fileCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
    fileCount.classList.toggle('hidden', count === 0);
    clearAllBtn.classList.toggle('hidden', count === 0);
}

function showFileList() {
    if (files.length === 0) {
        fileList.style.display = 'none';
        return;
    }

    fileList.style.display = 'block';
    fileList.innerHTML = '';

    files.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        const extension = file.name.split('.').pop().toLowerCase();
        const fileType = document.createElement('span');
        fileType.className = 'file-type';
        fileType.textContent = extension;

        const fileName = document.createElement('span');
        fileName.className = 'file-name';
        fileName.textContent = file.name;

        const fileSize = document.createElement('span');
        fileSize.className = 'file-size';
        fileSize.textContent = formatFileSize(file.size);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-file';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => removeFile(index);

        fileItem.appendChild(fileType);
        fileItem.appendChild(fileName);
        fileItem.appendChild(fileSize);
        fileItem.appendChild(removeBtn);
        fileList.appendChild(fileItem);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function removeFile(index) {
    files.splice(index, 1);
    updateFileCounter();
    showFileList();
    updateProcessButtonState();
}

function formatPath(fullPath) {
    if (!fullPath) return 'Chọn thư mục xuất';
    
    const maxLength = 40;
    if (fullPath.length <= maxLength) return fullPath;
    
    const parts = fullPath.split(/[/\\]/);
    const fileName = parts.pop();
    let path = parts.join('/');
    
    // If path is still too long, truncate the middle
    if (path.length > maxLength) {
        const start = path.substr(0, 20);
        const end = path.substr(-20);
        path = `${start}...${end}`;
    }
    
    return path + '/' + fileName;
}

// Output Folder Functions
async function selectOutputFolder() {
    const result = await ipcRenderer.invoke('select-output-folder');
    if (result.canceled) return;
    
    outputPath = result.filePaths[0];
    folderPath.textContent = formatPath(outputPath);
    folderPath.title = outputPath;
    updateProcessButtonState();
}

function updateProcessButtonState() {
    const canProcess = files.length > 0 && outputPath !== null;
    processBtn.disabled = !canProcess;
}

// Processing Functions
async function processFiles() {
    if (files.length === 0 || !outputPath) return;

    const suffix = document.getElementById('suffixInput').value;
    const format = document.getElementById('formatSelect').value;

    dropArea.classList.add('processing');
    processBtn.disabled = true;
    document.getElementById('processingAnimation').classList.add('active');

    try {
        let processed = 0;
        for (const file of files) {
            statusText.textContent = `Đang xử lý: ${file.name}`;
            
            const buffer = await file.arrayBuffer();
            const result = await ipcRenderer.invoke('process-image', {
                buffer: buffer,
                name: file.name,
                outputPath: outputPath,
                suffix: suffix,
                format: format
            });

            if (!result.success) {
                throw new Error(`Failed to process ${file.name}: ${result.error}`);
            }

            processed++;
            const progress = (processed / files.length) * 100;
            progressFill.style.width = `${progress}%`;
        }

        showCompletionMessage(true);
    } catch (error) {
        console.error('Error processing files:', error);
        showCompletionMessage(false);
    } finally {
        dropArea.classList.remove('processing');
        document.getElementById('processingAnimation').classList.remove('active');
        processBtn.disabled = false;
        statusText.textContent = 'Trạng thái: Sẵn sàng';
        progressFill.style.width = '0';
    }
}

function showCompletionMessage(success) {
    completionMessage.textContent = success 
        ? `Đã xử lý thành công ${files.length} file. Các file đã được lưu trong thư mục đã chọn.`
        : 'Có lỗi xảy ra trong quá trình xử lý file.';
    completionModal.classList.add('active');
}

async function openOutputFolder() {
    if (outputPath) {
        await ipcRenderer.invoke('open-output-folder', outputPath);
    }
    completionModal.classList.remove('active');
}

// Ripple effect
function createRipple(event) {
    const button = event.currentTarget;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    ripple.style.width = ripple.style.height = `${diameter}px`;
    
    const rect = button.getBoundingClientRect();
    ripple.style.left = `${event.clientX - rect.left - diameter / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - diameter / 2}px`;
    
    button.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
}

// Add ripple effect to buttons
const buttons = document.querySelectorAll('button');
buttons.forEach(button => {
    button.addEventListener('click', createRipple);
});

// Initialize the app when the window loads
window.addEventListener('load', initializeApp);

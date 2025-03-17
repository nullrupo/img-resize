// Module xử lý hình ảnh
const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');
const removeAccents = require('remove-accents');

// Hàm đổi tên tiếng Việt thành không dấu và quy tắc đặt tên Unity
function convertToValidFilename(filename) {
  // Tách phần tên và phần mở rộng
  const extname = path.extname(filename);
  const basename = path.basename(filename, extname);
  
  // Loại bỏ dấu tiếng Việt
  let newName = removeAccents(basename);
  
  // Thay thế dấu cách bằng dấu gạch dưới
  newName = newName.replace(/\s+/g, '_');
  
  // Loại bỏ các ký tự đặc biệt không được phép trong Unity
  newName = newName.replace(/[^\w\.-]/g, '');
  
  // Kết hợp tên mới với phần mở rộng
  return newName + extname;
}

// Hàm tính toán kích thước mới để chia hết cho 4
function calculateNewSize(width, height) {
  // Tính toán chiều rộng mới để chia hết cho 4
  const newWidth = Math.round(width / 4) * 4;
  
  // Tính toán chiều cao mới để chia hết cho 4
  const newHeight = Math.round(height / 4) * 4;
  
  // Kiểm tra xem có thay đổi quá 4px mỗi chiều không
  const widthChange = Math.abs(newWidth - width);
  const heightChange = Math.abs(newHeight - height);
  
  // Nếu thay đổi > 4px, điều chỉnh lại để chỉ thay đổi tối đa 4px
  let finalWidth = newWidth;
  let finalHeight = newHeight;
  
  if (widthChange > 4) {
    finalWidth = width + (width < newWidth ? 4 : -4);
    // Đảm bảo vẫn chia hết cho 4
    finalWidth = Math.round(finalWidth / 4) * 4;
  }
  
  if (heightChange > 4) {
    finalHeight = height + (height < newHeight ? 4 : -4);
    // Đảm bảo vẫn chia hết cho 4
    finalHeight = Math.round(finalHeight / 4) * 4;
  }
  
  return { width: finalWidth, height: finalHeight };
}

// Xử lý một hình ảnh
async function processImage(filePath, outputDirectory, suffix, outputFormat) {
  try {
    let image;
    let inputName;
    
    // Handle both file paths and File objects
    if (typeof filePath === 'object' && filePath.isFileObject) {
      console.log('Processing File object in image processor');
      const fileObject = filePath.path; // The actual File object
      
      // Create a buffer from the File object
      const arrayBuffer = await fileObject.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Create sharp instance from buffer
      image = sharp(buffer);
      inputName = fileObject.name;
    } else {
      // Regular file path processing
      image = sharp(filePath);
      inputName = path.basename(filePath);
    }
    
    // Đọc thông tin hình ảnh
    const metadata = await image.metadata();
    
    // Tính toán kích thước mới
    const { width, height } = calculateNewSize(metadata.width, metadata.height);
    
    // Chuẩn bị tên file mới
    const cleanName = convertToValidFilename(inputName);
    
    // Tách phần tên và phần mở rộng
    const extname = path.extname(cleanName);
    const basename = path.basename(cleanName, extname);
    
    // Xác định định dạng đầu ra
    let outputExt = extname;
    if (outputFormat !== 'original') {
      outputExt = `.${outputFormat}`;
    }
    
    // Tạo tên file đầu ra
    const outputName = `${basename}${suffix}${outputExt}`;
    const outputPath = path.join(outputDirectory, outputName);
    
    // Resize hình ảnh và không thay đổi chất lượng
    let resizedImage = image.resize({
      width,
      height,
      fit: 'fill', // Sử dụng 'fill' để đảm bảo kích thước đầu ra chính xác
      withoutEnlargement: false
    });
    
    // Định dạng đầu ra
    if (outputFormat === 'png') {
      resizedImage = resizedImage.png({ quality: 100 });
    } else if (outputFormat === 'jpg' || outputFormat === 'jpeg') {
      resizedImage = resizedImage.jpeg({ quality: 100 });
    }
    
    // Lưu file
    await resizedImage.toFile(outputPath);
    
    return {
      success: true,
      originalPath: typeof filePath === 'object' ? filePath.path.name : filePath,
      outputPath,
      originalSize: { width: metadata.width, height: metadata.height },
      newSize: { width, height }
    };
  } catch (error) {
    console.error(`Error processing image:`, error);
    return {
      success: false,
      originalPath: typeof filePath === 'object' ? filePath.path.name : filePath,
      error: error.message
    };
  }
}

// Xử lý nhiều hình ảnh
async function processImages({ filePaths, outputDirectory, suffix, outputFormat }) {
  const results = [];
  
  for (const filePath of filePaths) {
    // Xử lý từng hình ảnh
    const result = await processImage(filePath, outputDirectory, suffix, outputFormat);
    results.push(result);
  }
  
  return results;
}

module.exports = {
  processImages
};
// Preload script - Kết nối ứng dụng Electron với giao diện người dùng
const { contextBridge, ipcRenderer } = require('electron');

// Hiển thị API an toàn cho renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Chọn thư mục đầu ra
  selectOutputFolder: () => ipcRenderer.invoke('select-output-folder'),
  
  // Mở thư mục trên hệ thống
  openDirectory: (directory) => ipcRenderer.invoke('open-directory', directory),
  
  // Lấy cài đặt ứng dụng
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  
  // Lưu cài đặt ứng dụng
  saveAppSettings: (settings) => ipcRenderer.invoke('save-app-settings', settings),
  
  // Xử lý hình ảnh
  processImages: (params) => ipcRenderer.invoke('process-images', params),
  
  // Get files from folder recursively
  getFilesFromFolder: (folderPath) => ipcRenderer.invoke('get-files-from-folder', folderPath),
  
  // Helper to upload image file directly
  uploadImageFile: async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          path: file.path || file.name,
          name: file.name,
          size: file.size,
          type: file.name.split('.').pop().toLowerCase(),
          buffer: reader.result
        });
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
});
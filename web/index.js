import './styles.css';

let files = [];
let outputPath = null;

// DOM Elements
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const explicitFileBtn = document.getElementById('explicitFileBtn');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const clearAllBtn = document.getElementById('clearAllBtn');
const processBtn = document.getElementById('processBtn');
const statusText = document.getElementById('statusText');
const progressFill = document.getElementById('progressFill');
const completionModal = document.getElementById('completionModal');
const completionMessage = document.getElementById('completionMessage');
const closeModalBtn = document.getElementById('closeModalBtn');

// Event Listeners
explicitFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
dropArea.addEventListener('dragover', handleDragOver);
dropArea.addEventListener('dragleave', handleDragLeave);
dropArea.addEventListener('drop', handleDrop);
processBtn.addEventListener('click', processFiles);
closeModalBtn.addEventListener('click', () => completionModal.classList.remove('active'));
clearAllBtn.addEventListener('click', clearAllFiles);

// Clear all files function
function clearAllFiles() {
    files = [];
    updateFileCounter();
    showFileList();
    updateProcessButtonState();
    
    dropArea.classList.add('pulse-animation');
    setTimeout(() => {
        dropArea.classList.remove('pulse-animation');
    }, 500);
}

// File Handling Functions
function handleFileSelect(event) {
    const newFiles = Array.from(event.target.files);
    addFiles(newFiles);
    event.target.value = '';
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

    const newFiles = [];
    for (let item of items) {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (isFileTypeSupported(file.name)) {
                newFiles.push(file);
            }
        }
    }

    addFiles(newFiles);
}

function isFileTypeSupported(filename) {
    const supportedExtensions = ['.png', '.jpg', '.jpeg'];
    return supportedExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function addFiles(newFiles) {
    const supportedFiles = newFiles.filter(file => isFileTypeSupported(file.name));
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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

function removeFile(index) {
    files.splice(index, 1);
    updateFileCounter();
    showFileList();
    updateProcessButtonState();
}

function updateProcessButtonState() {
    processBtn.disabled = files.length === 0;
}

async function processFiles() {
    if (files.length === 0) return;

    const suffix = document.getElementById('suffixInput').value;
    const format = document.getElementById('formatSelect').value;

    dropArea.classList.add('processing');
    processBtn.disabled = true;
    document.getElementById('processingAnimation').classList.add('active');

    try {
        let processed = 0;
        for (const file of files) {
            statusText.textContent = `Đang xử lý: ${file.name}`;
            
            await processImage(file);

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

async function processImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Make dimensions divisible by 4
                    width = getNearestMultipleOf4(width);
                    height = getNearestMultipleOf4(height);

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to blob and download
                    const format = document.getElementById('formatSelect').value;
                    const suffix = document.getElementById('suffixInput').value;
                    const ext = format === 'original' ? file.name.split('.').pop() : format;
                    const fileName = `${file.name.split('.')[0]}${suffix}.${ext}`;

                    canvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = fileName;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        resolve();
                    }, `image/${format === 'original' ? 'png' : format}`);
                };
                img.src = e.target.result;
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getNearestMultipleOf4(num) {
    const remainder = num % 4;
    if (remainder === 0) return num;
    
    const lower = num - remainder;
    const upper = lower + 4;
    
    if (num - lower > 4) return upper;
    if (upper - num > 4) return lower;
    
    return (remainder < 2) ? lower : upper;
}

function showCompletionMessage(success) {
    completionMessage.textContent = success 
        ? `Đã xử lý thành công ${files.length} file. Các file đã được tải xuống.`
        : 'Có lỗi xảy ra trong quá trình xử lý file.';
    completionModal.classList.add('active');
} 
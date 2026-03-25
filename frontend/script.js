const API_URL = 'http://127.0.0.1:8000';

// DOM Elements
const video = document.getElementById('webcam');
const imagePreview = document.getElementById('image-preview');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fileUpload = document.getElementById('file-upload');
const dropZone = document.getElementById('drop-zone');

// Buttons
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const reanalyzeBtn = document.getElementById('reanalyze-btn');

// Status Elements
const apiStatus = document.getElementById('api-status');
const scanningEffect = document.getElementById('scanning-effect');

// Right Panel Details
const detailDim = document.getElementById('detail-dim');
const detailFormat = document.getElementById('detail-format');
const detailRes = document.getElementById('detail-res');

// Left Panel Bars
const maskOnBar = document.getElementById('mask-on-bar');
const maskOnText = document.getElementById('mask-on-text');
const maskOffBar = document.getElementById('mask-off-bar');
const maskOffText = document.getElementById('mask-off-text');

let stream = null;
let isAnalyzing = false;
let currentMode = null; // 'camera' or 'image'

// Initialize
async function init() {
    checkBackendConnection();
    setupEventListeners();
}

async function checkBackendConnection() {
    try {
        const res = await fetch(`${API_URL}/`);
        if (res.ok) {
            apiStatus.className = 'status-dot green';
        } else {
            apiStatus.className = 'status-dot red';
        }
    } catch (err) {
        apiStatus.className = 'status-dot red';
    }
}

function setupEventListeners() {
    startBtn.addEventListener('click', startWebcamAnalysis);
    stopBtn.addEventListener('click', stopAnalysis);
    reanalyzeBtn.addEventListener('click', analyzeImage);
    
    // File Upload via click
    fileUpload.addEventListener('change', handleFileUpload);
    
    // Drag and Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            fileUpload.files = e.dataTransfer.files;
            handleFileUpload({ target: fileUpload });
        }
    });

    // Reset default HOME view
    document.querySelector('.btn-home').addEventListener('click', () => {
        stopAnalysis();
        imagePreview.classList.add('hidden');
        video.classList.remove('hidden');
        startBtn.classList.remove('hidden');
        reanalyzeBtn.classList.add('hidden');
        updateDetails('-', '-', '-');
        updateBars(0, 0);
    });
}

async function startWebcamAnalysis() {
    try {
        currentMode = 'camera';
        imagePreview.classList.add('hidden');
        video.classList.remove('hidden');
        reanalyzeBtn.classList.add('hidden');
        
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        video.srcObject = stream;
        
        video.onloadedmetadata = () => {
            isAnalyzing = true;
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            scanningEffect.classList.remove('hidden');
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            updateDetails(`${video.videoWidth} x ${video.videoHeight} px`, 'WebRTC Stream', '72 DPI');
            
            processFrame();
        };
    } catch (err) {
        console.error("Webcam error:", err);
        alert("Camera access denied or unavailable.");
    }
}

function stopAnalysis() {
    isAnalyzing = false;
    scanningEffect.classList.add('hidden');
    stopBtn.classList.add('hidden');
    updateBars(0, 0);
    
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
    }
    
    if (currentMode === 'camera') {
        startBtn.classList.remove('hidden');
    }
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        stopAnalysis();
        currentMode = 'image';
        
        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
            imagePreview.classList.remove('hidden');
            video.classList.add('hidden');
            startBtn.classList.add('hidden');
            
            // Image loaded
            imagePreview.onload = () => {
                updateDetails(`${imagePreview.naturalWidth} x ${imagePreview.naturalHeight} px`, file.type.split('/')[1].toUpperCase(), `${(file.size / 1024).toFixed(1)} KB`);
                analyzeImage();
            };
        };
        reader.readAsDataURL(file);
    }
}

async function analyzeImage() {
    isAnalyzing = true;
    currentMode = 'image';
    reanalyzeBtn.classList.add('hidden');
    scanningEffect.classList.remove('hidden');
    
    canvas.width = imagePreview.naturalWidth;
    canvas.height = imagePreview.naturalHeight;
    ctx.drawImage(imagePreview, 0, 0);
    
    const base64Data = canvas.toDataURL('image/jpeg');
    await sendPrediction(base64Data);
    
    isAnalyzing = false;
    scanningEffect.classList.add('hidden');
    reanalyzeBtn.classList.remove('hidden');
}

async function processFrame() {
    if (!isAnalyzing || currentMode !== 'camera') return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.8);
    
    await sendPrediction(base64Data);
    
    if (isAnalyzing) {
        // Small delay to prevent network flooding if needed, but requestAnimationFrame works too
        requestAnimationFrame(processFrame);
    }
}

async function sendPrediction(base64Data) {
    try {
        const response = await fetch(`${API_URL}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: base64Data })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            const conf = parseFloat((data.confidence * 100).toFixed(1));
            if (data.prediction === 'with_mask') {
                updateBars(conf, 100 - conf);
            } else {
                updateBars(100 - conf, conf);
            }
        }
    } catch (err) {
        console.error("API error:", err);
    }
}

function updateBars(maskOnPerc, maskOffPerc) {
    // Fix JS floating point issues (e.g. 100 - 99.8 = 0.20000000000000284)
    const onStr = Number(maskOnPerc).toFixed(1);
    const offStr = Number(maskOffPerc).toFixed(1);

    maskOnBar.style.width = `${onStr}%`;
    maskOnText.textContent = maskOnPerc > 0 ? `(${onStr}%)` : '';
    
    maskOffBar.style.width = `${offStr}%`;
    maskOffText.textContent = maskOffPerc > 0 ? `(${offStr}%)` : '';
}

function updateDetails(dim, format, res) {
    detailDim.textContent = dim;
    detailFormat.textContent = format;
    detailRes.textContent = res;
}

window.addEventListener('DOMContentLoaded', init);

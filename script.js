// Frontend controller: upload/progress/stream + Player + Timestamp Filter


import { escapeHTML, parseAndPill, categoryClass, parseGeminiOutput, timeToSeconds, buildStructuredOutput } from './parser.js';
let currentAnalysisXHR = null;
let autoCloseTimer = null;


const form = document.getElementById('form');

const videoInput = document.getElementById('video');

const urlInput = document.getElementById('url');



const dropZone = document.getElementById('dropZone');

const browseBtn = document.getElementById('browseBtn');

const fileInfo = document.getElementById('fileInfo');



// Progress modal elements

const progressModal = document.getElementById('progressModal');

const progressStatus = document.getElementById('progressStatus');

const progressETA = document.getElementById('progressETA');

const progressConsole = document.getElementById('progressConsole');

const closeProgressModal = document.getElementById('closeProgressModal');

const modalRetryBtn = document.getElementById('modalRetryBtn');

const streamPreview = document.getElementById('progressStreamPreview');

const uploadMetrics = document.getElementById('uploadMetrics');

const uploadProgressText = document.getElementById('uploadProgressText');

const uploadSpeedText = document.getElementById('uploadSpeedText');

const uploadRemainingText = document.getElementById('uploadRemainingText');

const uploadProgressBar = document.getElementById('uploadProgressBar');

const progressDetailsPanel = document.getElementById('progressDetailsPanel');

const toggleProgressDetailsBtn = document.getElementById('toggleProgressDetails');



const resultsPre = document.getElementById('results');

const timestampCardsContainer = document.getElementById('timestampCards');

const summaryEl = document.getElementById('summary');

const metaBody = document.getElementById('metaBody');

const metaTableWrap = document.getElementById('meta');



// Delete modal elements

const deleteModal = document.getElementById('deleteModal');

const deleteStatus = document.getElementById('deleteStatus');

const deleteProgressBar = document.getElementById('deleteProgressBar');

const deleteProgressPercent = document.getElementById('deleteProgressPercent');

const deleteSubStatus = document.getElementById('deleteSubStatus');



const tsFilterBtn = document.getElementById('tsFilterBtn');

const tsFilterDropdown = document.getElementById('tsFilterDropdown');

const activeFilterPill = document.getElementById('activeFilterPill');

let activeTsFilter = 'all';



const player = document.getElementById('player');

const ytWrap = document.getElementById('ytWrap');

const ytFrame = document.getElementById('ytFrame');



const submitBtn = document.getElementById('submitBtn');

const clearBtn = document.getElementById('clearBtn');

const shareBtn = document.getElementById('shareBtn');

const newAnalysisBtn = document.getElementById('newAnalysisBtn');

const logoutBtn = document.getElementById('logoutBtn');



// History panel elements

const historyBtn = document.getElementById('historyBtn');

const historyPanel = document.getElementById('historyPanel');

const closeHistoryBtn = document.getElementById('closeHistoryBtn');

const historyList = document.getElementById('historyList');

const historySearch = document.getElementById('historySearch');

const historyStorageBar = document.getElementById('historyStorageBar');

const historyStorageText = document.getElementById('historyStorageText');

const TOTAL_STORAGE_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB



let uploadTriggered = false;

let etaTimer = null;

let progressDetailsExpanded = false;



// Tab functionality (results inner tabs)

const tabs = Array.from(document.querySelectorAll('.tab'));

const tabContents = Array.from(document.querySelectorAll('.tab-content'));



// Main tabs (Analyze / Results)

const mainTabs = Array.from(document.querySelectorAll('[data-tab-main]'));

const mainTabContents = Array.from(document.querySelectorAll('.main-tab-content'));



tabs.forEach(tab => {

  tab.addEventListener('click', () => {

    tabs.forEach(t => t.classList.remove('active'));

    tab.classList.add('active');

    tabContents.forEach(c => c.classList.remove('active'));

    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

  });

});



mainTabs.forEach(btn => {

  btn.addEventListener('click', () => {

    mainTabs.forEach(b => b.classList.remove('active'));

    btn.classList.add('active');

    mainTabContents.forEach(c => c.classList.remove('active'));

    document.getElementById(`tab-${btn.dataset.tabMain}-main`).classList.add('active');

  });

});



function showToast(msg) {

  const toast = document.getElementById('toast');

  if (!toast) return;

  toast.textContent = msg;

  toast.classList.remove('hidden');

  setTimeout(() => toast.classList.add('hidden'), 2000);

}



// Current step tracking for animated steps

let currentStepElement = null;



// Helper function to update animated step

function updateStep(message, isComplete = false, isError = false) {

  if (!progressConsole) return;

  
  
  // Don't remove final completion step - keep it visible

  if (currentStepElement && !isComplete) {

    currentStepElement.classList.add('step-fade-out');

    setTimeout(() => {

      if (currentStepElement && currentStepElement.parentNode) {

        currentStepElement.remove();

      }

    }, 300);

  }

  
  
  // Create new step element

  currentStepElement = document.createElement('div');

  currentStepElement.className = 'console-step';

  
  
  if (isError) {

    currentStepElement.classList.add('step-error');

    currentStepElement.innerHTML = `<span class="step-error-icon">✗</span> ${message}`;

  } else if (isComplete) {

    currentStepElement.classList.add('step-complete');

    currentStepElement.innerHTML = `<span class="step-check">✓</span> ${message}`;

    // Keep final step visible, don't fade it out

    currentStepElement.style.position = 'relative';

  } else {

    currentStepElement.classList.add('step-active');

    currentStepElement.innerHTML = `<span class="step-spinner">⟳</span> ${message}`;

  }

  
  
  progressConsole.appendChild(currentStepElement);

  progressConsole.scrollTop = progressConsole.scrollHeight;

  
  
  // Clean up old steps (keep only last 3, but always keep the final complete step)

  while (progressConsole.children.length > 3) {

    const firstChild = progressConsole.firstChild;

    // Don't remove if it's the final complete step

    if (!firstChild.classList.contains('step-complete') || progressConsole.children.length > 1) {

      progressConsole.removeChild(firstChild);

    } else {

      break;

    }

  }

}



// Legacy function for errors/notices (keep for compatibility)

function addConsoleLog(message) {

  if (!progressConsole) return;

  // Only use for errors/notices, not for regular steps

  if (message.startsWith('[Error]') || message.startsWith('[Notice]')) {

    const line = document.createElement('div');

    line.className = 'console-notice';

    line.textContent = message;

    progressConsole.appendChild(line);

    progressConsole.scrollTop = progressConsole.scrollHeight;

  }

}



// Update streaming content preview

function updateStreamingContent(fullText) {

  if (!progressConsole) return;

  
  
  // Find or create streaming content container

  let streamingContent = progressConsole.querySelector('.streaming-content');

  if (!streamingContent) {

    streamingContent = document.createElement('div');

    streamingContent.className = 'streaming-content';

    progressConsole.appendChild(streamingContent);

  }

  
  
  if (!fullText || fullText.trim().length === 0) {

    streamingContent.innerHTML = '<div class="streaming-preview muted">Waiting for analysis to begin...</div>';

    return;

  }

  
  
  // Extract key information from the text

  const text = fullText.trim();

  const lines = text.split(/\r?\n/);

  
  
  // Count words

  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  
  
  // Check for key sections

  const hasMetadata = /METADATA/i.test(text);

  const hasTimestamps = /TIMESTAMPS/i.test(text) || /\[.*\]\s*-/.test(text);

  const hasSummary = /SUMMARY/i.test(text) || /STORYLINE/i.test(text);

  
  
  // Get recent content snippet (last 150 characters of actual content, not headers)

  const contentLines = lines.filter(l => 

    l.trim() && 

    !l.startsWith('METADATA') && 

    !l.startsWith('TIMESTAMPS') && 

    !l.startsWith('SUMMARY') &&

    !l.startsWith('**')

  );

  const recentContent = contentLines.slice(-3).join(' ').trim();

  const preview = recentContent.length > 120 

    ? recentContent.substring(recentContent.length - 120) + '...' 

    : recentContent;
  
  

  // Extract detected topics/categories

  const categories = [];

  if (/911|emergency/i.test(text)) categories.push('Emergency Calls');

  if (/investigation/i.test(text)) categories.push('Investigation');

  if (/interrogation/i.test(text)) categories.push('Interrogation');

  if (/cctv|footage/i.test(text)) categories.push('CCTV');

  if (/body\s*cam|bodycam/i.test(text)) categories.push('Body Cam');

  
  
  // Build preview HTML

  let previewHTML = '<div class="streaming-preview">';

  
  
  // Status indicators

  previewHTML += '<div class="streaming-status">';

  if (hasMetadata) previewHTML += '<span class="status-badge">📋 Metadata</span>';

  if (hasTimestamps) previewHTML += '<span class="status-badge">⏱️ Timestamps</span>';

  if (hasSummary) previewHTML += '<span class="status-badge">📄 Summary</span>';

  previewHTML += '</div>';

  
  
  // Word count

  if (wordCount > 0) {

    previewHTML += `<div class="streaming-stats">${wordCount} words analyzed</div>`;

  }

  
  
  // Categories detected

  if (categories.length > 0) {

    previewHTML += `<div class="streaming-categories">Detected: ${categories.join(', ')}</div>`;

  }

  
  
  // Content preview

  if (preview) {

    previewHTML += `<div class="streaming-text">${escapeHTML(preview)}</div>`;

  }

  
  
  previewHTML += '</div>';

  streamingContent.innerHTML = previewHTML;

  progressConsole.scrollTop = progressConsole.scrollHeight;

}



// NEW HELPER: Updates the live stat cards
function updateLiveStats(fullText) {
  // Remove HTML tags if present and get clean text
  const cleanText = fullText.replace(/<[^>]*>/g, '').trim();
  
  // Count words - match sequences of letters (including apostrophes in words like "don't")
  // This excludes numbers, timestamps, and other non-word tokens
  const words = cleanText.match(/[a-zA-Z]+(?:'[a-zA-Z]+)*/g) || [];
  
  // Count timestamps - match patterns like [MM:SS or [00:00
  const timestamps = cleanText.match(/\[\d{1,2}:\d{2}/g) || [];
  
  // Count categories - match category headers like "1. CATEGORY NAME (5)"
  const categories = cleanText.match(/^\d+\.\s*[A-Z\s&]+\s*\(\d+\)/gm) || [];

  const wordsEl = document.getElementById('stat-words-analyzed');
  const timestampsEl = document.getElementById('stat-timestamps-found');
  const categoriesEl = document.getElementById('stat-categories-found');

  if (wordsEl) wordsEl.textContent = words.length;
  if (timestampsEl) timestampsEl.textContent = timestamps.length;
  if (categoriesEl) categoriesEl.textContent = categories.length;
}

// NEW HELPER: Shows the modal error state
function showModalError(errorMessage) {
  const modalContent = progressModal.querySelector('.progress-modal-content');
  if (modalContent) {
    modalContent.classList.add('error-state');
  }
  
  progressStatus.textContent = 'Analysis Failed';
  
  const errorMsg = errorMessage.replace('[Error]', '').trim();
  if (streamPreview) {
    streamPreview.innerHTML = `<span style="color: var(--err);">${escapeHTML(errorMsg)}</span>`;
  }
  
  if (etaTimer) clearInterval(etaTimer);

  if (toggleProgressDetailsBtn) {
    toggleProgressDetailsBtn.disabled = true;
  }
  setProgressDetailsVisibility(true);
}

// NEW HELPER: Hides the modal error state
function hideModalError() {
  const modalContent = progressModal.querySelector('.progress-modal-content');
  if (modalContent) {
    modalContent.classList.remove('error-state');
  }
  // Reset stream preview
  if (streamPreview) {
    streamPreview.innerHTML = '<span class="muted">Waiting for AI stream...</span>';
  }
  if (toggleProgressDetailsBtn) {
    toggleProgressDetailsBtn.disabled = false;
  }
  setProgressDetailsVisibility(false);
}

const uploadStats = {
  active: false,
  totalBytes: 0,
  lastLoaded: 0,
  lastTimestamp: 0
};

function getNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function formatBytesPrecise(bytes) {
  if (!isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let value = bytes;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = index === 0 ? 0 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function formatSpeed(bytesPerSecond) {
  if (!isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 MB/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  let index = 0;
  let value = bytesPerSecond;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const decimals = index <= 1 ? 0 : 2;
  return `${value.toFixed(decimals)} ${units[index]}`;
}

function showUploadMetrics(totalBytes) {
  uploadStats.active = true;
  uploadStats.totalBytes = totalBytes;
  uploadStats.lastLoaded = 0;
  uploadStats.lastTimestamp = getNowMs();
  if (uploadMetrics) uploadMetrics.classList.remove('hidden');
  if (uploadProgressText) uploadProgressText.textContent = `${formatBytesPrecise(0)} / ${formatBytesPrecise(totalBytes || 0)}`;
  if (uploadSpeedText) uploadSpeedText.textContent = '0 MB/s';
  if (uploadRemainingText) {
    const remaining = totalBytes ? formatBytesPrecise(totalBytes) : '—';
    uploadRemainingText.textContent = `${remaining} left`;
  }
  if (uploadProgressBar) uploadProgressBar.style.width = '0%';
}

function updateUploadMetrics(loaded, totalBytes) {
  if (!uploadStats.active) return;

  const now = getNowMs();
  const deltaBytes = Math.max(loaded - uploadStats.lastLoaded, 0);
  const deltaSeconds = Math.max((now - (uploadStats.lastTimestamp || now)) / 1000, 0.001);
  const instantaneousSpeed = deltaBytes / deltaSeconds;
  uploadStats.lastLoaded = loaded;
  uploadStats.lastTimestamp = now;
  if (uploadProgressText) {
    const uploadedText = formatBytesPrecise(loaded);
    const totalText = totalBytes ? formatBytesPrecise(totalBytes) : '—';
    uploadProgressText.textContent = `${uploadedText} / ${totalText}`;
  }
  if (uploadSpeedText) {
    uploadSpeedText.textContent = formatSpeed(instantaneousSpeed);
  }
  if (uploadRemainingText) {
    const remainingBytes = totalBytes ? Math.max(totalBytes - loaded, 0) : 0;
    uploadRemainingText.textContent = totalBytes ? `${formatBytesPrecise(remainingBytes)} left` : '— left';
  }
  if (uploadProgressBar && totalBytes) {
    const percent = Math.max(0, Math.min(100, (loaded / totalBytes) * 100));
    uploadProgressBar.style.width = `${percent}%`;
  }
}

function finalizeUploadMetrics() {
  if (!uploadStats.active) return;
  const totalBytes = uploadStats.totalBytes;
  if (uploadProgressText) {
    uploadProgressText.textContent = `${formatBytesPrecise(totalBytes)} / ${formatBytesPrecise(totalBytes)}`;
  }
  if (uploadSpeedText) {
    uploadSpeedText.textContent = 'Upload complete';
  }
  if (uploadRemainingText) {
    uploadRemainingText.textContent = '0 MB left';
  }
  if (uploadProgressBar) uploadProgressBar.style.width = '100%';
}

function resetUploadMetrics() {
  uploadStats.active = false;
  uploadStats.totalBytes = 0;
  uploadStats.lastLoaded = 0;
  uploadStats.lastTimestamp = 0;
  if (uploadMetrics && !uploadMetrics.classList.contains('hidden')) {
    uploadMetrics.classList.add('hidden');
  }
  if (uploadProgressText) uploadProgressText.textContent = '0 MB / 0 MB';
  if (uploadSpeedText) uploadSpeedText.textContent = '0 MB/s';
  if (uploadRemainingText) uploadRemainingText.textContent = '0 MB left';
  if (uploadProgressBar) uploadProgressBar.style.width = '0%';
}

function setProgressDetailsVisibility(show) {
  progressDetailsExpanded = !!show;
  if (!progressDetailsPanel) return;
  if (progressDetailsExpanded) {
    progressDetailsPanel.classList.remove('hidden');
    if (toggleProgressDetailsBtn) {
      toggleProgressDetailsBtn.classList.add('expanded');
      toggleProgressDetailsBtn.textContent = 'Hide Details';
    }
  } else {
    progressDetailsPanel.classList.add('hidden');
    if (toggleProgressDetailsBtn) {
      toggleProgressDetailsBtn.classList.remove('expanded');
      toggleProgressDetailsBtn.textContent = 'Show Details';
    }
  }
}

function scheduleProgressAutoClose(delayMs = 3000) {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
  }
  autoCloseTimer = setTimeout(() => {
    setUpload(0, 'Idle');
    autoCloseTimer = null;
  }, delayMs);
}

// Checkpoint tracking

let currentCheckpoint = null;

const checkpointProgressBar = document.getElementById('checkpointProgressBar');



// Update checkpoint progress

function updateCheckpointProgress(percentage) {

  if (!checkpointProgressBar) return;

  const clampedPercent = Math.max(0, Math.min(100, Number(percentage) || 0));

  checkpointProgressBar.style.width = `${clampedPercent}%`;

  const thresholds = {

    upload: 1,

    process: 35,

    analyze: 60,

    complete: 95,

  };

  document.querySelectorAll('.checkpoint').forEach(cp => {

    const name = cp.getAttribute('data-checkpoint');

    if (thresholds[name] !== undefined && clampedPercent >= thresholds[name]) {

      cp.classList.add('active');

    } else {

      cp.classList.remove('active');

    }

  });

}



// Activate a checkpoint

function activateCheckpoint(checkpointName) {

  if (currentCheckpoint === checkpointName) return;

  

  // Mark previous checkpoint as completed

  if (currentCheckpoint) {

    const prevCheckpoint = document.querySelector(`.checkpoint[data-checkpoint="${currentCheckpoint}"]`);

    if (prevCheckpoint) {

      prevCheckpoint.classList.remove('active');

      prevCheckpoint.classList.add('completed');

    }

  }

  

  // Activate new checkpoint

  const checkpoint = document.querySelector(`.checkpoint[data-checkpoint="${checkpointName}"]`);

  if (checkpoint) {

    checkpoint.classList.add('active');

    checkpoint.classList.remove('completed');

  }

  

  currentCheckpoint = checkpointName;

  

  // Update progress bar position

  const checkpoints = ['upload', 'process', 'analyze', 'complete'];

  const index = checkpoints.indexOf(checkpointName);

  const progress = index >= 0 ? ((index + 1) / checkpoints.length) * 100 : 0;

  updateCheckpointProgress(progress);

}



// Delete modal controller

function setDeleteProgress(percent, status, subStatus) {

  if (percent > 0 && deleteModal.classList.contains('hidden')) {

    deleteModal.classList.remove('hidden');

    deleteModal.style.opacity = '1';

  }

  

  if (percent <= 0 && !deleteModal.classList.contains('hidden')) {

    deleteModal.style.opacity = '0';

    setTimeout(() => {

      deleteModal.classList.add('hidden');

      if (deleteProgressBar) deleteProgressBar.style.width = '0%';

      if (deleteProgressPercent) deleteProgressPercent.textContent = '0%';

    }, 300);

  }

  

  const cleanPercent = Math.max(0, Math.min(100, percent));

  

  if (deleteProgressBar) {

    deleteProgressBar.style.width = `${cleanPercent}%`;

  }

  

  if (deleteProgressPercent) {

    deleteProgressPercent.textContent = `${Math.round(cleanPercent)}%`;

  }

  

  if (deleteStatus && status) {

    deleteStatus.textContent = status;

  }

  

  if (deleteSubStatus && subStatus) {

    deleteSubStatus.textContent = subStatus;

  }

}



// New progress modal controller

function setUpload(percent, statusText = '', etaText = '') {
  if (!progressModal) return;

  const numericPercent = Number(percent);
  const clampedPercent = Math.max(0, Math.min(100, isFinite(numericPercent) ? numericPercent : 0));

  if (clampedPercent > 0 && clampedPercent < 100 && autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }

  if (clampedPercent <= 0) {
    if (!progressModal.classList.contains('hidden')) {
      progressModal.style.opacity = '0';
      setTimeout(() => {
        progressModal.classList.add('hidden');
        hideModalError();
        resetUploadMetrics();
        if (etaTimer) clearInterval(etaTimer);
        if (progressETA) {
          progressETA.textContent = '';
          progressETA.style.display = 'none';
        }
        currentCheckpoint = null;
        document.querySelectorAll('.checkpoint').forEach(cp => cp.classList.remove('active', 'completed'));
        updateCheckpointProgress(0);
        setProgressDetailsVisibility(false);
      }, 300);
    }
    progressDetailsExpanded = false;
    return;
  }

  if (progressModal.classList.contains('hidden')) {
    progressModal.classList.remove('hidden');
    progressModal.style.opacity = '1';
    hideModalError();
    updateLiveStats('');
    currentCheckpoint = null;
    document.querySelectorAll('.checkpoint').forEach(cp => cp.classList.remove('active', 'completed'));
    progressDetailsExpanded = false;
    setProgressDetailsVisibility(false);
  }

  if (progressStatus && statusText) {
    progressStatus.textContent = statusText;
  }

  if (progressETA) {
    if (etaText) {
      progressETA.textContent = etaText;
      progressETA.style.display = 'block';
    } else {
      progressETA.textContent = '';
      progressETA.style.display = 'none';
    }
  }

  updateCheckpointProgress(clampedPercent);

  if (clampedPercent >= 100) {
    scheduleProgressAutoClose(4000);
  }
}



// This function connects the server's text stream to the modal

function parseServerLine(line) {

  const originalLine = line.trim();

  if (!originalLine) return;



  const streamPreview = document.getElementById('progressStreamPreview');



  // --- 1. Check for Errors FIRST ---

  if (originalLine.startsWith('[Error]')) {

    showModalError(originalLine); // Trigger the error state

    return; // Stop processing

  }



  // --- 2. Check for Server Commands ---

  if (originalLine.startsWith('[Notice]')) {

    const l = originalLine.toLowerCase();

    

    // (ETA logic)

    if (l.includes('eta:')) {

      try {

        const totalSeconds = parseInt(originalLine.match(/ETA:\s*(\d+)/i)[1], 10);

        if (totalSeconds > 0) {

          const etaEl = document.getElementById('progressETA');

          const startTime = Date.now();

          if (etaTimer) clearInterval(etaTimer);

          

          const updateTimer = () => {

            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            const remaining = totalSeconds - elapsed;



            if (remaining <= 0) {

              if(etaEl) etaEl.textContent = 'Finishing up...';

              clearInterval(etaTimer);

              etaTimer = null;

            } else {

              const minutes = Math.floor(remaining / 60);

              const seconds = remaining % 60;

              if(etaEl) etaEl.textContent = `Estimated time remaining: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

            }

          };

          updateTimer(); // Run once immediately

          if(etaEl) etaEl.style.display = 'block';

          etaTimer = setInterval(updateTimer, 1000);

        }

      } catch (e) { console.warn('Could not parse ETA', e); }

      return; // This was an ETA command, do nothing else

    }

    

    if (l.includes('queued') || l.includes('queue position')) {

      const positionMatch = originalLine.match(/position:?\s*(\d+)/i);

      const position = positionMatch ? parseInt(positionMatch[1], 10) : null;

      if (position !== null) {

        setUpload(5, `Queued… Position: ${position}`);

      } else {

        setUpload(5, 'Queued…');

      }

      activateCheckpoint('upload');

      return;

    }

    

    // (Checkpoint logic)

    if (l.includes('downloading youtube video')) {

      setUpload(10, 'Downloading…');

      activateCheckpoint('upload');

    } else if (l.includes('uploading video to gemini')) {

      setUpload(10, 'Uploading to Gemini…');

      activateCheckpoint('upload');

    } else if (l.includes('upload complete')) {

      setUpload(40, 'Upload complete.');

      activateCheckpoint('process');
      resetUploadMetrics(); // <-- ADDED FIX

    } else if (l.includes('waiting for gemini')) {

      setUpload(50, 'Processing video…');

      activateCheckpoint('process');
      resetUploadMetrics(); // <-- ADDED FIX

    } else if (l.includes('file is active')) {

      setUpload(60, 'File is ACTIVE. Analyzing…');

      activateCheckpoint('analyze');
      resetUploadMetrics(); // <-- ADDED FIX

      if (streamPreview && streamPreview.textContent.includes('Waiting')) streamPreview.innerHTML = '';

    } else if (l.includes('analysis complete')) {

      setUpload(100, 'Complete ✓');

      activateCheckpoint('complete');

      scheduleProgressAutoClose();

    }

    return;

  }



  // --- 3. If it's not a command or error, it's AI Text ---

  if (streamPreview) {

    if (streamPreview.textContent.includes('Waiting for AI stream...')) {

      streamPreview.innerHTML = '';

    }

    streamPreview.appendChild(document.createTextNode(line));

    streamPreview.scrollTop = streamPreview.scrollHeight;

    updateLiveStats(streamPreview.textContent);

  }

}



if (browseBtn && videoInput) {
browseBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent event from bubbling to dropzone
    e.preventDefault();
    try {
  videoInput.click();
    } catch (err) {
      console.error('Error opening file dialog:', err);
      showToast('Error opening file dialog. Please try again.');
    }
  });
}



if (videoInput) {
  // Ensure file input accepts video files
  videoInput.setAttribute('accept', 'video/*');
  videoInput.setAttribute('type', 'file');
  
  videoInput.addEventListener('change', (e) => {
    console.log('File input changed:', e.target.files);
    
    const files = e.target.files || (e.target && e.target.files);
    
    if (files && files.length > 0) {
      const file = files[0];
      
      // Validate file type
      if (!file.type.startsWith('video/')) {
        console.warn('Invalid file type:', file.type);
        showToast('Please select a video file.');
        videoInput.value = ''; // Clear the input
        currentVideoFile = null;
        currentVideoFileName = null;
        return;
      }
      
      // Validate file size (2GB limit)
      const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes
      if (file.size > MAX_FILE_SIZE) {
        const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
        console.warn('File too large:', file.name, sizeGB, 'GB');
        showToast(`File size (${sizeGB} GB) exceeds the 2 GB limit. Please select a smaller file.`);
        videoInput.value = ''; // Clear the input
        currentVideoFile = null;
        currentVideoFileName = null;
        if (fileInfo) {
          fileInfo.textContent = '';
          fileInfo.classList.add('hidden');
        }
        return;
      }
      
      console.log('File selected:', file.name, file.size, file.type);

      // Store file reference for upload and history
      currentVideoFile = file;
      currentVideoFileName = file.name;

      if (fileInfo) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        fileInfo.textContent = `Selected file: ${file.name} (${sizeMB} MB)`;
    fileInfo.classList.remove('hidden');
      }

    uploadTriggered = false;

      if (ytWrap) ytWrap.classList.add('hidden');
      if (ytFrame) ytFrame.removeAttribute('src');

      try {
        // Revoke previous URL if exists
        if (player && player.src && player.src.startsWith('blob:')) {
          URL.revokeObjectURL(player.src);
        }
        
    const url = URL.createObjectURL(file);
        if (player) {
    player.src = url;
    player.classList.remove('hidden');
          console.log('Video player updated with file:', file.name);
          showToast(`Video loaded: ${file.name}`);
        }
      } catch (err) {
        console.error('Error creating object URL:', err);
        showToast('Error loading video file. Please try again.');
      }

    } else {
      console.warn('No file selected');
      // Clear previous file reference
      currentVideoFile = null;
      currentVideoFileName = null;
    }

  }, false);
}



['dragenter', 'dragover'].forEach(ev => {

  dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('hover'); });

});

['dragleave', 'drop'].forEach(ev => {

  dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('hover'); });

});

dropZone.addEventListener('drop', (e) => {

  const dt = e.dataTransfer;

  if (dt && dt.files && dt.files[0]) {

    // Use DataTransfer API to properly set files
    try {

      const dataTransfer = new DataTransfer();

      dataTransfer.items.add(dt.files[0]);

      Object.defineProperty(videoInput, 'files', {

        value: dataTransfer.files,

        writable: false,

        configurable: true

      });

      videoInput.dispatchEvent(new Event('change', { bubbles: true }));

    } catch (err) {

      // Fallback: manually trigger the file handling

      console.log('Using fallback file assignment');

      const file = dt.files[0];

      // Validate file type
      if (!file.type.startsWith('video/')) {
        console.warn('Invalid file type:', file.type);
        showToast('Please select a video file.');
        return;
      }

      // Validate file size (2GB limit)
      const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes
      if (file.size > MAX_FILE_SIZE) {
        const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
        console.warn('File too large:', file.name, sizeGB, 'GB');
        showToast(`File size (${sizeGB} GB) exceeds the 2 GB limit. Please select a smaller file.`);
        return;
      }

      if (fileInfo) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        fileInfo.textContent = `Selected file: ${file.name} (${sizeMB} MB)`;

        fileInfo.classList.remove('hidden');

      }

      uploadTriggered = false;

      if (ytWrap) ytWrap.classList.add('hidden');

      if (ytFrame) ytFrame.removeAttribute('src');

      const url = URL.createObjectURL(file);

      if (player) {

        player.src = url;

        player.classList.remove('hidden');

      }

      // Store file reference for upload

      currentVideoFile = file;

      currentVideoFileName = file.name;

    }

  }

});

toggleProgressDetailsBtn?.addEventListener('click', () => {
  setProgressDetailsVisibility(!progressDetailsExpanded);
});

setProgressDetailsVisibility(false);



// Allow clicking the dropzone to open file dialog
if (dropZone && videoInput) {
dropZone.addEventListener('click', (e) => {
  // Don't trigger if clicking the browse button (it has its own handler)
  if (e.target === browseBtn || e.target.closest('#browseBtn')) {
    return;
  }
    
  // Only trigger if clicking the dropzone area itself
    try {
  videoInput.click();
    } catch (err) {
      console.error('Error opening file dialog from dropzone:', err);
      showToast('Error opening file dialog. Please try again.');
    }
});
}



// Removed chips (prompt suggestions)



// Helper: reset inputs only (keep results)

function resetInputsOnly() {

  urlInput.value = '';

  videoInput.value = '';

  fileInfo.textContent = '';

  fileInfo.classList.add('hidden');

  player.pause();

  player.removeAttribute('src');

  player.classList.add('hidden');

  ytFrame.removeAttribute('src');

  ytWrap.classList.add('hidden');

  uploadTriggered = false;

}



// New Analysis: reset inputs only (keep existing results visible in Results tab)

function startNewAnalysis() {

  resetInputsOnly();

  document.querySelectorAll('.history-item').forEach(el => {

    el.classList.remove('active');

  });

  mainTabs.forEach(b => b.classList.remove('active'));

  document.querySelector('[data-tab-main="analyze"]').classList.add('active');

  mainTabContents.forEach(c => c.classList.remove('active'));

  document.getElementById('tab-analyze-main').classList.add('active');

  currentVideoFile = null;

  currentVideoFileName = null;

}



newAnalysisBtn?.addEventListener('click', startNewAnalysis);



clearBtn.addEventListener('click', () => {

  urlInput.value = '';

  videoInput.value = '';

  fileInfo.textContent = '';

  fileInfo.classList.add('hidden');

  player.pause();

  player.removeAttribute('src');

  player.classList.add('hidden');

  ytFrame.removeAttribute('src');

  ytWrap.classList.add('hidden');

  uploadTriggered = false;

  currentVideoFile = null;

  currentVideoFileName = null;

});



function toYouTubeEmbed(url) {

  try {

    const u = new URL(url);

    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com') {

      const v = u.searchParams.get('v');

      if (v) return `https://www.youtube.com/embed/${v}`;

    }

    if (host === 'youtu.be') {

      const id = u.pathname.split('/').filter(Boolean)[0];

      if (id) return `https://www.youtube.com/embed/${id}`;

    }

  } catch {}

  return '';

}



// Store current video file reference for history saving

let currentVideoFile = null;

let currentVideoFileName = null;

let savedVideoPath = null;



// Function to handle form submission with automatic retry for network errors

async function handleSubmit(e) {

  if (e) e.preventDefault();

  // Reset saved video path for each new analysis
  savedVideoPath = null;
  
  // Reset ETA timer
  if (etaTimer) clearInterval(etaTimer);
  const etaEl = document.getElementById('progressETA');
  if (etaEl) etaEl.style.display = 'none';
  
  console.log('Submit button clicked - handleSubmit called');

  
  
  const url = (urlInput.value || '').trim();

  const file = (videoInput.files && videoInput.files[0]) || currentVideoFile;

  if (file) {
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
      showToast(`File size (${sizeGB} GB) exceeds the 2 GB limit. Please select a smaller file.`);
      setUpload(0, 'Idle');
      return;
    }
  }

  currentVideoFile = file || null;
  currentVideoFileName = file?.name || null;

  resultsPre.textContent = '';

  setUpload(10, 'Preparing…');

  shareBtn.disabled = true;
  
  
  // Retry configuration

  const MAX_RETRIES = 3;

  let retryCount = 0;

  
  
  try {

    // Main retry loop for network errors

    while (retryCount < MAX_RETRIES) {

      try {

        await performAnalysis(url, file);

        // Success - break out of retry loop

        break;

      } catch (error) {

        const errorMessage = error.message || String(error);

        const isNetworkError = errorMessage.includes('Network error') || 

                              errorMessage.includes('Failed to fetch') ||

                              errorMessage.includes('Connection timeout') ||

                              errorMessage.includes('Connection failed') ||

                              errorMessage.includes('AbortError') ||

                              error.name === 'AbortError';
        
        

        // Only retry network errors, not server/validation errors

        if (isNetworkError && retryCount < MAX_RETRIES - 1) {

          retryCount++;

          const remainingRetries = MAX_RETRIES - retryCount;

          
          
          console.log(`Network error occurred. Retrying... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);

          updateStep(`Network error. Retrying in ${Math.min(3 * retryCount, 10)} seconds... (${remainingRetries} attempts remaining)`, false);

          addConsoleLog(`[Notice] Network error detected. Auto-retrying... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);

          
          
          // Wait before retry (exponential backoff: 3s, 6s, 9s)

          const delay = Math.min(3000 * retryCount, 10000);

          await new Promise(resolve => setTimeout(resolve, delay));

          
          
          // Reset progress for retry

          setUpload(10, 'Retrying…');

          continue;

        } else {

          // Either not a network error, or max retries reached

          throw error;

        }

      }

    }

    
    
    // Note: Modal auto-closes after 3 seconds in the xhr.onload success handler
    // No need for additional timeout here (removed unreliable check)
    
    

  } catch (finalError) {
    // NEW: Check for user-initiated abort
    if (finalError.message === 'UserAborted') {
      console.log('Analysis aborted by user.');
      setUpload(0, 'Idle'); // Hide modal
      submitBtn.disabled = false; // Re-enable submit button
      return; // Stop processing, don't show an error
    }
    // END NEW

    // This catches errors after all retries are exhausted or non-network errors

    setUpload(0, 'Idle');

    const finalErrorMsg = finalError.message || 'Unknown error occurred';

    
    
    // Show final error message

    if (finalErrorMsg.includes('Network error') || finalErrorMsg.includes('Failed to fetch') || 

        finalErrorMsg.includes('Connection timeout') || finalErrorMsg.includes('Connection failed')) {

      addConsoleLog(`[Error] Network error after ${MAX_RETRIES} attempts. Please check your connection.`);

      showToast(`Connection failed after ${MAX_RETRIES} attempts. Please check your internet connection and server status.`);

    } else if (finalErrorMsg.includes('401') || finalErrorMsg.includes('403')) {

      addConsoleLog(`[Error] ${finalErrorMsg}`);

      showToast('Authentication error. Check your GEMINI_API_KEY in .env file');

    } else if (finalErrorMsg.includes('timeout') && !finalErrorMsg.includes('Connection')) {

      addConsoleLog(`[Error] ${finalErrorMsg}`);

      showToast('Analysis timed out. The server may be processing a large file. Please try again.');

    } else {

      addConsoleLog(`[Error] ${finalErrorMsg}`);

      showToast(finalErrorMsg);

    }

  } finally {

    submitBtn.disabled = false;

  }

}



// Separate function to perform the actual analysis
async function performAnalysis(url, file) {

  // This new function returns a Promise to integrate with your existing retry logic
  return new Promise((resolve, reject) => {
    submitBtn.disabled = true;
    setUpload(12, 'Submitting…');

    const fd = new FormData();
    if (file) {
      fd.append('video', file);
      console.log('FormData: Added video file', file.name);
    }
    if (url) {
      fd.append('url', url);
      console.log('FormData: Added URL', url);
    }

    // --- XHR IMPLEMENTATION ---
    const xhr = new XMLHttpRequest();
    currentAnalysisXHR = xhr; // Assign to global variable
    xhr.open('POST', '/upload', true);
    // Set headers for server-side streaming
    xhr.setRequestHeader('Accept', 'text/plain');

    let softTimer = null;
    let softPct = 60;
    let activityTimer = null;
    let hasReceivedData = false;
    let lastActivityTime = Date.now();
    const ACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes timeout

    let lastStreamIndex = 0; // To process stream in chunks

    // NEW: Handle user abort
    xhr.onabort = () => {
      console.log('XHR aborted by user.');
      if (activityTimer) clearInterval(activityTimer);
      if (softTimer) {
        clearInterval(softTimer);
        softTimer = null;
      }
      if (etaTimer) clearInterval(etaTimer);
      currentAnalysisXHR = null; // Clear global
      reject(new Error('UserAborted')); // Reject promise with special error
    };

    // --- 1. UPLOAD Progress (Client -> Server) ---
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = (event.loaded / event.total) * 100;
        const overallPercent = 10 + (percent * 0.30);
        setUpload(overallPercent, 'Uploading…');
        if (uploadMetrics) uploadMetrics.classList.remove('hidden');
        if (!uploadStats.active) {
          showUploadMetrics(event.total);
        }
        updateUploadMetrics(event.loaded, event.total);
      }
    };

    xhr.upload.onloadstart = () => {
      if (file) {
        setUpload(10, 'Uploading…');
        activateCheckpoint('upload');
        showUploadMetrics(file.size);
      } else {
        setUpload(10, 'Submitting…');
        activateCheckpoint('upload');
        showUploadMetrics(null); // <-- MODIFIED: Show panel in indeterminate state for URLs
      }
    };

    xhr.upload.onload = () => {
      // This fires when the upload *completes*
      finalizeUploadMetrics();
      // if (uploadMetrics) uploadMetrics.classList.add('hidden'); // <-- REMOVED: Don't hide yet
      setUpload(40, 'Upload complete.');
      activateCheckpoint('process');
    };

    xhr.upload.onerror = () => {
      currentAnalysisXHR = null;
      reject(new Error('Network error during upload.'));
    };
    
    xhr.upload.ontimeout = () => {
      currentAnalysisXHR = null;
      reject(new Error('Upload timed out.'));
    };

    // --- 2. DOWNLOAD Progress (Server -> Client Stream) ---
    xhr.onprogress = (event) => {
      // This event fires as the server streams data *back* to us
      const fullResponse = xhr.responseText;
      const newText = fullResponse.substring(lastStreamIndex);
      lastStreamIndex = fullResponse.length;

      if (!newText) return;

      // Update activity time
      lastActivityTime = Date.now();
      if (!hasReceivedData) {
        hasReceivedData = true;
        // First chunk received, hide upload metrics after a short delay
        // setTimeout(() => resetUploadMetrics(), 1500); // <-- REMOVED: Don't hide here
      }

      resultsPre.textContent += newText;
      resultsPre.scrollTop = resultsPre.scrollHeight;

      // Process all new lines
      const lines = newText.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        parseServerLine(line); // This updates checkpoints and modal text
      }

      // Update streaming stats
      if (progressStatus && (progressStatus.textContent.includes('Streaming') || progressStatus.textContent.includes('Analyzing'))) {
        updateStreamingContent(resultsPre.textContent);
      }

      // Animate the "soft" progress bar during analysis
      if (progressStatus && (progressStatus.textContent.includes('Streaming') || progressStatus.textContent.includes('Analyzing'))) {
        if (!softTimer) {
          setUpload(softPct, progressStatus.textContent);
          softTimer = setInterval(() => {
            if (softPct < 95) {
              softPct += 1;
              setUpload(softPct, progressStatus.textContent);
            } else {
              clearInterval(softTimer);
              softTimer = null;
            }
          }, 400);
        }
      }
      
      // Re-build the structured output in real-time
      buildStructuredOutputWrapper(resultsPre.textContent);
    };

    // --- 3. Stream/Request Completion ---
    xhr.onload = async () => {
      currentAnalysisXHR = null; // Clear global
      // This fires when the *entire* request is done (stream finished)
      if (activityTimer) clearInterval(activityTimer);
      if (softTimer) {
        clearInterval(softTimer);
        softTimer = null;
      }
      if (etaTimer) clearInterval(etaTimer);
      
      const etaEl = document.getElementById('progressETA');
      if (etaEl) etaEl.textContent = 'Finishing up...';

      if (xhr.status >= 200 && xhr.status < 300) {
        // --- SUCCESS ---
        if (!hasReceivedData && !url) { // URL-only might not stream data if download is fast
          updateStep('Warning: No data received from server', true, true);
          showToast('Analysis completed but no results received');
        } else {

          if (progressConsole && resultsPre.textContent.trim().length > 0) {
            updateStreamingContent(resultsPre.textContent);
          }

          try {
            updateStep('Reloading history and loading media...', false);

            // Wait for server to save, then reload history
            await new Promise(resolve => setTimeout(resolve, 1000));
            await renderHistory(historySearch ? historySearch.value : '');

            // Load media into player
            if (currentVideoFile) {
              updateStep('Loading media into player...', false);
              try {
                if (!player.src || player.src === window.location.href) {
                  const objUrl = URL.createObjectURL(currentVideoFile);
                  player.src = objUrl;
                }
                player.classList.remove('hidden');
                ytFrame?.removeAttribute('src');
                ytWrap?.classList.add('hidden');
                await new Promise(resolve => setTimeout(resolve, 500));
              } catch (videoError) {
                console.warn('Could not reload local media:', videoError);
              }
            } else if (urlInput && urlInput.value.trim()) {
              updateStep('Loading video into player...', false);
              const embed = toYouTubeEmbed(urlInput.value.trim());
              if (embed) {
                if (ytFrame) ytFrame.src = embed;
                ytWrap?.classList.remove('hidden');
                player?.classList.add('hidden');
              }
              await new Promise(resolve => setTimeout(resolve, 300));
            }

            // Switch to results tab
            updateStep('Opening results view...', false);
            mainTabs.forEach(b => b.classList.remove('active'));
            document.querySelector('[data-tab-main="results"]')?.classList.add('active');
            mainTabContents.forEach(c => c.classList.remove('active'));
            document.getElementById('tab-results-main')?.classList.add('active');
            
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            document.querySelector('.tab[data-tab="structured"]')?.classList.add('active');
            document.getElementById('tab-structured')?.classList.add('active');
          } catch (postProcessError) {
            console.error('Post-processing error after analysis:', postProcessError);
            addConsoleLog(`[Error] Post-processing error: ${postProcessError.message || postProcessError}`);
            showToast('Analysis finished, but UI failed to update. Please refresh.', 'error');
          
          } finally {
            setUpload(100, 'Complete ✓');
            updateStep('Everything is ready!', true);
            activateCheckpoint('complete');
            updateCheckpointProgress(100);

            scheduleProgressAutoClose();

            setTimeout(() => {
              if (progressConsole) {
                const celebration = document.createElement('div');
                celebration.className = 'console-step step-complete';
                celebration.style.marginTop = '12px';
                celebration.style.background = 'rgba(29, 229, 160, 0.15)';
                celebration.style.animation = 'stepSlideIn 0.5s ease';
                celebration.innerHTML = `<span class="step-check">✓</span> <strong style="color: var(--ok);">Success!</strong> Your video analysis is complete and ready to view.`;
                progressConsole.appendChild(celebration);
                progressConsole.scrollTop = progressConsole.scrollHeight;
              }
            }, 300);
          }
        }
        resolve(); // Resolve the promise on success
      } else {
        // --- SERVER ERROR (4xx, 5xx) ---
        let msg = `Error ${xhr.status}`;
        try {
          // Try to parse JSON error from server
          const j = JSON.parse(xhr.responseText);
          if (j?.message) msg += `: ${j.message}`;
        } catch {
          // Fallback to text
          msg += `: ${xhr.responseText || xhr.statusText}`;
        }
        addConsoleLog(`Server error: ${msg}`);
        showToast(msg);
        reject(new Error(msg)); // Reject the promise on server error
      }
    };

    // --- 4. General Error Handling ---
    xhr.onerror = () => {
      currentAnalysisXHR = null; // Clear global
      if (activityTimer) clearInterval(activityTimer);
      if (softTimer) {
        clearInterval(softTimer);
        softTimer = null;
      }
      updateStep('Connection failed', true, true);
      addConsoleLog(`[Error] Network error: Failed to connect.`);
      showToast(`Failed to connect to server.`);
      reject(new Error('Network error: Failed to connect.'));
    };

    xhr.ontimeout = () => {
      currentAnalysisXHR = null; // Clear global
      if (activityTimer) clearInterval(activityTimer);
      if (softTimer) {
        clearInterval(softTimer);
        softTimer = null;
      }
      updateStep('Connection timed out', true, true);
      addConsoleLog(`[Error] Connection timeout.`);
      showToast(`Connection timed out.`);
      reject(new Error('Connection timeout.'));
    };

    // --- 5. Activity Monitor (for stream) ---
    activityTimer = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTime;
      const minutesSinceActivity = Math.round(timeSinceActivity / 60000);
      
      if (timeSinceActivity > ACTIVITY_TIMEOUT) {
        clearInterval(activityTimer);
        if (softTimer) {
          clearInterval(softTimer);
          softTimer = null;
        }
        updateStep('Analysis timed out. Please try again.', true, true);
        addConsoleLog(`[Error] Timeout: No activity from server for ${minutesSinceActivity} minutes`);
        showToast('Analysis timed out. Please try again.');
        xhr.abort();
        reject(new Error('Analysis timeout - no activity from server'));
      } else if (timeSinceActivity > 3 * 60 * 1000 && hasReceivedData) {
        // Only show this warning *after* we've started receiving data
        if (currentStepElement && !currentStepElement.textContent.includes('minutes')) {
          updateStep(`Waiting for Gemini... (${minutesSinceActivity} minutes)`);
        }
      }
    }, 300000000000000); // Check every 30 seconds

    // --- 6. Send the request ---
    console.log('Sending XHR request...');
    updateStep(url ? 'Connecting to server (YouTube)...' : 'Connecting to server (local file)...', false);
    xhr.send(fd);
  });
}



// Close modal button handler
closeProgressModal?.addEventListener('click', () => {
  if (currentAnalysisXHR) {
    console.log('User clicked close. Aborting analysis.');
    currentAnalysisXHR.abort(); // This will trigger the onabort handler
    // The handleSubmit catch block will handle hiding the modal.
  } else {
    // No analysis running, just hide the modal
    hideModalError(); // Ensure error state is cleared
    setUpload(0, 'Idle');
  }
});



// --- NEW: Retry Button Listener ---

modalRetryBtn?.addEventListener('click', () => {

  console.log('Retry button clicked.');

  // Hide the error state

  hideModalError();

  // Set modal to a "retrying" state

  setUpload(10, 'Retrying…');

  // Call the main handleSubmit function again

  handleSubmit();

});



// Close modal when clicking outside (on the overlay)

progressModal?.addEventListener('click', (e) => {

  if (e.target === progressModal) {

    // Only close if clicking on the overlay, not the content

    if (progressStatus && progressStatus.textContent.includes('Complete')) {

      setUpload(0, 'Idle');

    }

  }

});



// Attach submit handler to form

form.addEventListener('submit', handleSubmit);



// Also attach click handler to submit button as backup

submitBtn.addEventListener('click', (e) => {

  e.preventDefault();

  handleSubmit(e);

});



/* =========================================

   ROBUST PARSING & RENDERING LOGIC

   ========================================= */



// buildStructuredOutput wrapper that passes the correct context
function buildStructuredOutputWrapper(text) {
  return buildStructuredOutput(
    text,
    timestampCardsContainer,
    summaryEl,
    metaTableWrap,
    metaBody,
    passesFilter,
    filterLabel
  );
}



timestampCardsContainer?.addEventListener('click', (e) => {

  const btn = e.target.closest('.ts-jump');

  if (!btn) return;

  const ts = btn.getAttribute('data-ts') || '';

  const secs = timeToSeconds(ts);

  if (!isNaN(secs)) {

    if (!player.classList.contains('hidden')) {

      try { player.currentTime = secs; player.play(); } catch {}

    } else if (!ytWrap.classList.contains('hidden')) {

      const cur = ytFrame.getAttribute('src') || '';

      if (cur) {

        const url = new URL(cur.split('?')[0]);

        url.searchParams.set('start', String(secs));

        url.searchParams.set('autoplay', '1');

        ytFrame.src = url.toString();

      }

    }

  }

});



tsFilterBtn?.addEventListener('click', (e) => {

  e.stopPropagation();

  tsFilterDropdown.classList.toggle('hidden');

  setTimeout(() => updateFilterHighlight(), 10);

});



document.addEventListener('click', (e) => {

  if (!tsFilterDropdown) return;

  if (e.target === tsFilterBtn || tsFilterDropdown.contains(e.target)) return;

  tsFilterDropdown.classList.add('hidden');

});



// Update active filter highlighting in dropdown

function updateFilterHighlight() {

  if (!tsFilterDropdown) return;

  const options = tsFilterDropdown.querySelectorAll('.filter-option');

  options.forEach(opt => {

    const filterVal = opt.getAttribute('data-filter') || 'all';

    if (filterVal === activeTsFilter) {

      opt.style.background = 'rgba(124, 196, 255, 0.15)';

      opt.style.borderColor = 'rgba(124, 196, 255, 0.4)';

    } else {

      opt.style.background = '';

      opt.style.borderColor = '';

    }

  });

}



tsFilterDropdown?.addEventListener('click', (e) => {

  const btn = e.target.closest('.filter-option');

  if (!btn) return;

  
  
  e.preventDefault();

  e.stopPropagation();

  
  
  const val = btn.getAttribute('data-filter') || 'all';

  activeTsFilter = val;

  
  
  if (activeFilterPill) {

    activeFilterPill.textContent = filterLabel(val);

  }

  
  
  updateFilterHighlight();

  tsFilterDropdown.classList.add('hidden');

  
  
  // Rebuild structured output with new filter

  if (resultsPre && resultsPre.textContent) {

    console.log(`🔄 Applying filter: ${val}`);

    buildStructuredOutputWrapper(resultsPre.textContent);
  } else {

    console.warn('⚠️ No analysis text available to filter');

  }

});





function filterLabel(val) {

  switch (val) {

    case '911_call': return '911 Call';

    case 'investigation': return 'Investigation';

    case 'interrogation': return 'Interrogation';

    case 'interview': return 'Interview';

    case 'cctv': return 'CCTV';

    case 'body_cam': return 'Body Cam';
    case 'dash_cam': return 'Dashcam';
    default: return 'All';

  }

}



function passesFilter(category) {

  if (activeTsFilter === 'all') return true;

  if (!category) return false;

  
  
  const c = (category || '').toLowerCase().trim();

  
  
  // More robust matching for each filter type

  if (activeTsFilter === '911_call') {

    return /911|call|emergency|dispatch/.test(c);

  }

  if (activeTsFilter === 'investigation') {

    return /investigation|investigat/.test(c);

  }

  if (activeTsFilter === 'interrogation') {

    return /interrogation|interrogat/.test(c);

  }

  if (activeTsFilter === 'interview') {

    return /interview|interviewing|interview\s*session/.test(c);

  }

  if (activeTsFilter === 'cctv') {

    return /cctv|footage|surveillance|security\s*camera/.test(c);

  }

  if (activeTsFilter === 'body_cam') {

    return /body\s*cam|bodycam|body\s*camera|officer\s*cam/.test(c);

  }

  if (activeTsFilter === 'dash_cam') {

    return /dash\s*cam|dashcam|vehicle\s*cam/.test(c);

  }

  
  
  return false;

}



document.getElementById('copyBtn')?.addEventListener('click', async () => {

  const text = resultsPre.textContent || '';

  try { await navigator.clipboard.writeText(text); showToast('Copied to clipboard.'); } catch { showToast('Copy failed.'); }

});



document.getElementById('saveBtn')?.addEventListener('click', () => {

  const text = resultsPre.textContent || '';

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });

  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);

  a.download = `gemini-analysis-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;

  document.body.appendChild(a); a.click(); a.remove();

  showToast('File saved.');

});



async function shareAnalysis(analysisText, videoUrl, fileName) {

  if (!analysisText || analysisText.trim() === '') {

    showToast('Please analyze a video first.');

    return;

  }

  
  
  let finalVideoUrl = videoUrl || null;

  
  
  // If we have a local file, upload it first to get a shareable URL

  if (!finalVideoUrl && videoInput.files && videoInput.files[0]) {

    try {

      const fd = new FormData();

      fd.append('file', videoInput.files[0]);

      const resp = await fetch('/share/upload', { method: 'POST', body: fd });

      if (resp.ok) {

        const j = await resp.json();

        if (j?.url) {

          // Convert relative URL to absolute for sharing

          finalVideoUrl = new URL(j.url, window.location.origin).href;

        }

      } else {

        showToast('Video upload failed; sharing without video.');

      }

    } catch (err) {

      console.error('Video upload error:', err);

      showToast('Video upload failed; sharing without video.');

    }

  } else if (finalVideoUrl && finalVideoUrl.startsWith('/shared/')) {

    // Convert relative URL to absolute if it's a relative /shared/ path

    finalVideoUrl = new URL(finalVideoUrl, window.location.origin).href;

  }

  
  
  // Create share link on server

  try {

    const resp = await fetch('/api/share', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        analysisText: analysisText.trim(),

        videoUrl: finalVideoUrl,

        fileName: fileName || null

      })

    });

    
    
    if (!resp.ok) {

      const error = await resp.json().catch(() => ({}));

      throw new Error(error.message || 'Failed to create share link');

    }

    
    
    const result = await resp.json();

    console.log('Full server response:', JSON.stringify(result, null, 2));

    
    
    // Always use shareId to construct URL if available (more reliable)

    let url;

    if (result.shareId) {

      url = `${window.location.origin}/share/${result.shareId}`;

      console.log('Constructed URL from shareId:', url);

      
      
      // If server also returned a URL, validate it matches

      if (result.url && result.url !== url) {

        console.warn('Server URL differs from constructed:', result.url, 'vs', url);

        // Use the constructed one as it's more reliable

      }

    } else if (result.url) {

      url = result.url;

      console.log('Using server-provided URL:', url);

    } else {

      console.error('No shareId or URL in server response:', result);

      throw new Error('Server did not return a share ID or URL');

    }

    
    
    // Final validation

    if (!url || url === window.location.origin + '/' || url === window.location.origin) {

      console.error('Invalid share URL after construction:', url);

      throw new Error('Failed to create valid share URL');

    }

    
    
    if (!url.includes('/share/')) {

      console.error('URL missing /share/ path:', url);

      throw new Error('Share URL is missing the /share/ path');

    }

    
    
    console.log('Final share URL:', url);

    
    
    // Copy to clipboard

    try {

      await navigator.clipboard.writeText(url);

      showToast('Shareable link copied to clipboard!');

    } catch (err) {

      // Fallback: show prompt

      window.prompt('Copy this shareable link:', url);

      showToast('Shareable link created!');

    }

  } catch (err) {

    console.error('Share error:', err);

    showToast(`Failed to create share link: ${err.message}`);

  }

}



// Share button

shareBtn.addEventListener('click', async () => {

  await shareAnalysis(resultsPre.textContent, urlInput.value, videoInput.files[0]?.name);

});



// ===== History (server) =====

async function loadHistory() {

  const resp = await fetch('/api/history');

  if (!resp.ok) return [];

  return await resp.json();

}



async function renderHistory(searchQuery = '') {

  if (!historyList) return;

  historyList.innerHTML = '';

  const history = await loadHistory();

  if (!history || history.length === 0) {

    historyList.innerHTML = `<li class="muted tiny" style="padding: 10px 12px;">No history yet.</li>`;

    await updateHistoryStorageUI();

    return;

  }

  
  
  // Filter history based on search query

  const query = (searchQuery || '').toLowerCase().trim();

  const filteredHistory = query 

    ? history.filter(item => item.name.toLowerCase().includes(query))

    : history;
  
  

  if (filteredHistory.length === 0 && query) {

    historyList.innerHTML = `<li class="muted tiny" style="padding: 10px 12px;">No results found for "${escapeHTML(query)}".</li>`;

    await updateHistoryStorageUI();

    return;

  }

  
  
  for (const item of filteredHistory) {

    const li = document.createElement('li');

    li.className = 'history-item';

    li.dataset.id = item.id;

    
    
    // Format date and time

    let dateTimeText = '';

    if (item.createdAt || item.date || item.id) {

      const timestamp = item.createdAt;

      const date = new Date(timestamp);

      const now = new Date();

      const diffMs = now - date;

      const diffMins = Math.floor(diffMs / 60000);

      const diffHours = Math.floor(diffMs / 3600000);

      const diffDays = Math.floor(diffMs / 86400000);

      
      
      // Format as relative time (e.g., "17h ago")

      if (diffMins < 1) {

        dateTimeText = 'Just now';

      } else if (diffMins < 60) {

        dateTimeText = `${diffMins}m ago`;

      } else if (diffHours < 24) {

        dateTimeText = `${diffHours}h ago`;

      } else if (diffDays < 7) {

        dateTimeText = `${diffDays}d ago`;

      } else {

        // Full date for older items

        dateTimeText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });

      }

    }

    
    
    // Get video name from fileName or extract from videoUrl
    let videoName = item.fileName || '';
    if (!videoName && item.videoUrl) {
      // Try to extract from YouTube URL or use a default
      if (item.videoUrl.includes('youtube.com') || item.videoUrl.includes('youtu.be')) {
        videoName = 'YouTube Video';
      } else {
        videoName = 'Video File';
      }
    }
    if (!videoName) {
      videoName = 'Unknown Video';
    }

    li.innerHTML = `

      <div class="history-item-content-wrapper">

        <div class="history-item-content">

          <div class="history-item-header">

            <span class="history-name" title="${item.name}">

              ${escapeHTML(item.name)}

            </span>

            <span class="history-timestamp">${dateTimeText}</span>

          </div>

          ${item.analyzedBy ? `<span class="history-user">Analyzed by: <span class="history-user-name-pill">${escapeHTML(item.analyzedBy.split(' ')[0].split('@')[0])}</span></span>` : ''}

          ${item.status === 'completed' ? `<span class="history-status status-complete"><span class="status-icon">✓</span></span>` : item.status === 'failed' ? `<span class="history-status status-failed"><span class="status-icon">✗</span></span>` : ''}

        </div>

        <div class="history-menu">

          <button class="history-menu-btn" data-item-id="${item.id}" aria-label="More options">⋮</button>

          <div class="history-menu-dropdown hidden" data-item-id="${item.id}">

            <button class="history-menu-item" data-action="share" title="Share">

              <span class="menu-icon">🔗</span> Share

            </button>

            <button class="history-menu-item" data-action="rename" title="Rename">

              <span class="menu-icon">✏️</span> Rename

            </button>

            <button class="history-menu-item" data-action="delete" title="Delete">

              <span class="menu-icon">🗑️</span> Delete

            </button>

          </div>

        </div>

      </div>

      <div class="history-delete-progress">

        <div class="history-delete-progress-bar"></div>

      </div>

    `;

    historyList.appendChild(li);

  }

  await updateHistoryStorageUI();

}



// Extract a meaningful title from analysis text or prompt

// Removed extractTitle - moved to server.js
function _extractTitle_REMOVED(analysisText, promptText, fileName, url) {

  // First, try to extract from prompt if it's descriptive (not the default prompt)

  if (promptText && promptText.trim()) {

    const defaultPromptKeywords = ['analyze this video', 'extract the following', 'metadata extraction', 'timestamp analysis'];

    const isDefaultPrompt = defaultPromptKeywords.some(keyword => 

      promptText.toLowerCase().includes(keyword)

    );

    
    
    if (!isDefaultPrompt) {

      // Use first line or first 60 chars of prompt as title

      const lines = promptText.split(/\n/).filter(l => l.trim());

      if (lines.length > 0) {

        const title = lines[0].trim();

        if (title.length > 0 && title.length < 100) {

          return title.length > 60 ? title.substring(0, 57) + '...' : title;

        }

      }

    }

  }

  
  
  // Try to extract from summary section

  if (analysisText) {

    const summaryMatch = analysisText.match(/(?:SUMMARY|STORYLINE)[\s\*:]*\n+(.+?)(?:\n\n|\nTIMESTAMPS|$)/is);

    if (summaryMatch && summaryMatch[1]) {

      const summary = summaryMatch[1].trim();

      const firstLine = summary.split('\n')[0].trim();

      if (firstLine && firstLine.length > 10) {

        return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;

      }

    }

    
    
    // Try to extract from metadata (e.g., case name, location)

    const metadataMatch = analysisText.match(/(?:METADATA|Date|Address|Location|Police Department)[\s\*:]*\n+[^\n]+:([^\n]+)/i);

    if (metadataMatch && metadataMatch[1]) {

      const metaValue = metadataMatch[1].trim();

      if (metaValue && metaValue.length > 5 && metaValue.length < 80) {

        return metaValue;

      }

    }

    
    
    // Try first meaningful line from analysis

    const lines = analysisText.split(/\n/).filter(l => {

      const trimmed = l.trim();

      return trimmed.length > 10 && 

             !trimmed.match(/^(METADATA|TIMESTAMPS|SUMMARY|STORYLINE|\[|\d+\.)/i);

    });

    if (lines.length > 0) {

      const firstLine = lines[0].trim();

      if (firstLine.length > 10 && firstLine.length < 100) {

        return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;

      }

    }

  }

  
  
  // Fallback to filename (without extension) or YouTube video title

  if (fileName) {

    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

    if (nameWithoutExt && nameWithoutExt.length > 0) {

      return nameWithoutExt.length > 60 ? nameWithoutExt.substring(0, 57) + '...' : nameWithoutExt;

    }

  }

  
  
  if (url && url.includes('youtube.com')) {

    const videoIdMatch = url.match(/[?&]v=([^&]+)/);

    if (videoIdMatch) {

      return `YouTube Video ${videoIdMatch[1].substring(0, 11)}`;

    }

  }

  
  
  // Last resort: generic title with date

  return `Video Analysis ${new Date().toLocaleDateString()}`;

}



// Removed addHistoryItem - history is now saved automatically by server during /upload
async function _addHistoryItem_REMOVED(analysisText) {

  if (!analysisText) return;

  
  
  // Use saved file reference or try to get from input

  const file = currentVideoFile || (videoInput.files && videoInput.files[0]);

  let url = (urlInput.value || '').trim();

  let fileName = currentVideoFileName || file?.name;

  const promptText = '';

  
  
  // If we have a local file, upload it to shared directory to get a permanent URL

  if (savedVideoPath) {
    // Use the path we received from the server stream
    url = savedVideoPath;
    // Convert to absolute URL if it's relative
    if (url.startsWith('/')) {
      url = new URL(url, window.location.origin).href;
    }
    console.log('Using pre-saved video path for history:', url);
  } else if (!url && file) {
    // This is now a FALLBACK, in case the server-side move failed
    console.log('Uploading local video to VPS storage (fallback)...', { fileName: file.name, fileSize: file.size });

    try {

      const fd = new FormData();

      fd.append('file', file);

      const r = await fetch('/share/upload', { method: 'POST', body: fd });

      if (r.ok) {

        const j = await r.json();

        if (j?.url) {

          // Server now returns absolute URL, but handle both cases

          url = j.url;

          // If it's still relative, convert to absolute

          if (url.startsWith('/')) {

            url = new URL(url, window.location.origin).href;

          }

          console.log('✅ Video successfully uploaded to VPS storage:', url);

          showToast('Video saved to VPS storage');

        } else {

          console.warn('Server response missing URL:', j);

        }

      } else {

        const errorText = await r.text();

        console.error('❌ Failed to upload video to VPS storage:', r.status, errorText);

        showToast('Warning: Video upload failed. History will be saved without video.');

        // Continue without URL - file won't be accessible from history

      }

    } catch (err) {

      console.error('❌ Error uploading video to VPS storage:', err);

      showToast('Error: Video upload failed. History will be saved without video.');

      // Continue without URL

    }

  } else if (url) {

    console.log('Using existing video URL for history:', url);

  } else {

    console.log('No video file or URL to save with history item');

  }

  
  
  // Extract meaningful title from analysis text, prompt, or file name
  // NOTE: This function is deprecated - history is now saved automatically by server
  // const name = extractTitle(analysisText, promptText, fileName, url);
  const name = 'Legacy item'; // Placeholder since this function shouldn't be called

  const resp = await fetch('/api/history', {

    method: 'POST', 

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({ name, analysisText, videoUrl: url || null, fileName })

  });

  
  
  if (resp.status === 413) {

    showToast('Storage full (20 GB). Please clear history.');

    alert('Storage limit reached (20 GB). Please delete some history items to free space.');

    return;

  }

  
  
  if (!resp.ok) {

    const j = await resp.json().catch(() => ({}));

    showToast(j?.message || 'Save failed');

    return;

  }

  
  
  const searchQuery = historySearch ? historySearch.value.trim() : '';

  await renderHistory(searchQuery);

}



function bytesToHuman(bytes) {

  const gb = bytes / (1024 * 1024 * 1024);

  if (gb >= 1) return `${gb.toFixed(2)} GB`;

  const mb = bytes / (1024 * 1024);

  if (mb >= 1) return `${mb.toFixed(1)} MB`;

  const kb = bytes / 1024;

  if (kb >= 1) return `${kb.toFixed(0)} KB`;

  return `${bytes} B`;

}



function estimateItemSizeBytes(item) {

  let total = 0;

  try { total += new Blob([item.analysisText || '']).size; } catch {}

  if (item.videoData instanceof Blob) {

    total += item.videoData.size || 0;

  } else if (typeof item.videoData === 'string') {

    try { total += new Blob([item.videoData]).size; } catch {}

  }

  return total;

}



async function updateHistoryStorageUI() {

  if (!historyStorageBar || !historyStorageText) return;

  try {

    const r = await fetch('/api/history/storage');

    if (!r.ok) throw new Error();

    const { used, total } = await r.json();

    const pct = Math.max(0, Math.min(100, (used / (total || TOTAL_STORAGE_BYTES)) * 100));

    historyStorageBar.style.width = `${pct}%`;

    historyStorageText.textContent = `${bytesToHuman(used)} / 20 GB`;

  } catch {

    historyStorageBar.style.width = '0%';

    historyStorageText.textContent = `— / 20 GB`;

  }

}



// Handle menu button clicks to toggle dropdown

historyList?.addEventListener('click', (e) => {

  const menuBtn = e.target.closest('.history-menu-btn');

  if (menuBtn) {

    e.stopPropagation();

    const itemId = menuBtn.dataset.itemId;

    const dropdown = document.querySelector(`.history-menu-dropdown[data-item-id="${itemId}"]`);

    if (dropdown) {

      // Close all other dropdowns

      document.querySelectorAll('.history-menu-dropdown').forEach(d => {

        if (d !== dropdown) {

          d.classList.add('hidden');

        }

      });

      // Toggle current dropdown

      dropdown.classList.toggle('hidden');

    }

    return;

  }

  // If clicking anywhere else in the history list (not the menu button), close all dropdowns
  // This includes clicks inside the dropdown itself (except menu items which handle closing themselves)

  document.querySelectorAll('.history-menu-dropdown').forEach(d => {

    d.classList.add('hidden');

  });

});



// Close dropdowns when clicking outside history panel

document.addEventListener('click', (e) => {

  // Check if click is outside the history panel entirely

  const isClickInsideHistoryPanel = e.target.closest('#historyPanel') || e.target.closest('#historyList');

  if (!isClickInsideHistoryPanel) {

    document.querySelectorAll('.history-menu-dropdown').forEach(d => {

      d.classList.add('hidden');

    });

  }

});



// Handle menu item clicks

historyList?.addEventListener('click', async (e) => {

  const menuItem = e.target.closest('.history-menu-item');

  if (menuItem) {

    e.stopPropagation();

    const action = menuItem.dataset.action;

    const itemEl = menuItem.closest('.history-item');

    if (!itemEl) return;

    
    
    const id = itemEl.dataset.id;

    
    
    // Close the dropdown

    const dropdown = document.querySelector(`.history-menu-dropdown[data-item-id="${id}"]`);

    if (dropdown) {

      dropdown.classList.add('hidden');

    }



    const hist = await loadHistory();

    const item = hist.find(i => String(i.id) === String(id));

    if (!item) return;



    if (action === 'delete') {

      if (confirm(`Delete "${item.name}"? This will permanently remove the analysis, associated video file, and any shared links.`)) {

        // Show delete modal
        setDeleteProgress(20, 'Deleting...', 'Removing job data...');

        try {
          // Simulate progress with updates
          const progressSteps = [
            { percent: 20, status: 'Deleting...', subStatus: 'Removing job data...' },
            { percent: 40, status: 'Deleting...', subStatus: 'Removing analysis files...' },
            { percent: 60, status: 'Deleting...', subStatus: 'Removing video files...' },
            { percent: 80, status: 'Deleting...', subStatus: 'Cleaning up shared links...' }
          ];

          let currentStep = 0;
          const progressInterval = setInterval(() => {
            if (currentStep < progressSteps.length) {
              const step = progressSteps[currentStep];
              setDeleteProgress(step.percent, step.status, step.subStatus);
              currentStep++;
            }
          }, 300);

          const resp = await fetch(`/api/history/${id}`, { method: 'DELETE' });

          clearInterval(progressInterval);

          setDeleteProgress(100, 'Deleting...', 'Finalizing...');

          // Small delay to show completion
          await new Promise(resolve => setTimeout(resolve, 400));

          if (resp.ok) {

            // Check if the deleted item is currently loaded - if so, clear the view

            const currentResults = resultsPre?.textContent || '';

            if (currentResults && currentResults.trim() === item.analysisText.trim()) {

              // Clear the current view since the deleted item was loaded

              resetInputsOnly();

              resultsPre.textContent = '';

              if (shareBtn) shareBtn.disabled = true;

            }

            const searchQuery = historySearch ? historySearch.value.trim() : '';

            await renderHistory(searchQuery);

            await updateHistoryStorageUI();

            showToast(`"${item.name}" deleted successfully.`);

          } else {

            const error = await resp.json().catch(() => ({}));

            showToast(`Failed to delete: ${error.message || 'Unknown error'}`);

          }

          // Hide modal
          setDeleteProgress(0, '', '');

        } catch (err) {

          setDeleteProgress(0, '', '');

          showToast(`Failed to delete: ${err.message || 'Unknown error'}`);

        }

      }

    } else if (action === 'rename') {

      const newName = prompt('Enter new name:', item.name);

      if (newName && newName.trim()) {

        await fetch(`/api/history/${id}`, { 

          method: 'PUT', 

          headers: { 'Content-Type':'application/json' }, 

          body: JSON.stringify({ name: newName.trim() }) 

        });

        const searchQuery = historySearch ? historySearch.value.trim() : '';

        await renderHistory(searchQuery);

      }

    } else if (action === 'share') {

      await shareAnalysis(item.analysisText, item.videoUrl || '', item.fileName);

    }

    return;

  }

  
  
  // Handle clicking on history item itself (to load it)

  const itemEl = e.target.closest('.history-item');

  if (!itemEl || e.target.closest('.history-menu')) return;

  
  
  const id = itemEl.dataset.id;

  const hist = await loadHistory();

  const item = hist.find(i => String(i.id) === String(id));

  if (!item) return;



  // Remove active class from all history items

  document.querySelectorAll('.history-item').forEach(el => {

    el.classList.remove('active');

  });

  
  
  // Add active class to clicked item

  itemEl.classList.add('active');



  // Load item (do not wipe results globally; reset inputs only)

  resetInputsOnly();

  resultsPre.textContent = item.analysisText;

    buildStructuredOutputWrapper(item.analysisText);
  
  
  // Check if it's a YouTube URL first

  if (typeof item.videoUrl === 'string' && item.videoUrl) {

    const embed = toYouTubeEmbed(item.videoUrl);

    if (embed) {

      // It's a YouTube URL

      urlInput.value = item.videoUrl;

      ytFrame.src = embed;

      ytWrap.classList.remove('hidden');

      player.classList.add('hidden');

      fileInfo.classList.add('hidden');

    } else if (item.videoUrl.startsWith('/shared/')) {

      // It's a shared local file URL - convert to absolute URL

      urlInput.value = item.videoUrl;

      const absoluteVideoUrl = new URL(item.videoUrl, window.location.origin).href;

      player.src = absoluteVideoUrl;

      player.classList.remove('hidden');

      ytWrap.classList.add('hidden');

      fileInfo.textContent = `Loaded from history: ${item.fileName || 'Saved video'}`;

      fileInfo.classList.remove('hidden');

      // Clear saved file reference since we're loading from server

      currentVideoFile = null;

      currentVideoFileName = null;

    } else {

      // Unknown URL format - check if it needs conversion

      urlInput.value = item.videoUrl;

      let videoUrlToLoad = item.videoUrl;

      // If it's a relative URL, convert to absolute

      if (videoUrlToLoad.startsWith('/')) {

        videoUrlToLoad = new URL(videoUrlToLoad, window.location.origin).href;

      }

      player.src = videoUrlToLoad;

      player.classList.remove('hidden');

      ytWrap.classList.add('hidden');

      fileInfo.textContent = `Loaded from history: ${item.fileName || 'Saved video'}`;

      fileInfo.classList.remove('hidden');

    }

  } else if (item.fileName) {

    // No URL but has filename - might be a local file that wasn't saved properly

    urlInput.value = '';

    player.removeAttribute('src');

    player.classList.add('hidden');

    ytWrap.classList.add('hidden');

    fileInfo.textContent = `Video file not available: ${item.fileName}`;

    fileInfo.classList.remove('hidden');

  }

  shareBtn.disabled = false;

  // Switch to Results main tab and show Structured view

  mainTabs.forEach(b => b.classList.remove('active'));

  document.querySelector('[data-tab-main="results"]').classList.add('active');

  mainTabContents.forEach(c => c.classList.remove('active'));

  document.getElementById('tab-results-main').classList.add('active');

  tabs.forEach(t => t.classList.remove('active'));

  tabContents.forEach(c => c.classList.remove('active'));

  document.querySelector('.tab[data-tab="structured"]').classList.add('active');

  document.getElementById('tab-structured').classList.add('active');

});



document.addEventListener('DOMContentLoaded', async () => {

  const searchQuery = historySearch ? historySearch.value.trim() : '';

  await renderHistory(searchQuery);

  // --- NEW CODE ---
  async function checkAdminStatus() {
    try {
      const res = await fetch('/api/user/me');
      if (!res.ok) return;
      const user = await res.json();

      if (user.isAdmin) {
        // User is an admin, add the admin button to header
        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
          const adminBtn = document.createElement('a');
          adminBtn.href = '/admin';
          adminBtn.className = 'btn ghost admin-btn';
          adminBtn.textContent = '🛡️ Admin';
          adminBtn.title = 'Admin Dashboard';
          adminBtn.style.textDecoration = 'none';
          headerActions.insertBefore(adminBtn, headerActions.firstChild);
        }
      }
    } catch (err) {
      console.warn('Could not check admin status', err);
    }
  }

  await checkAdminStatus();
  // --- END NEW CODE ---

  
  
  // Grid icon button - can be used for menu toggle in future

  const gridIconBtn = document.querySelector('.history-grid-icon');

  if (gridIconBtn) {

    gridIconBtn.addEventListener('click', () => {

      // Future: toggle menu or sidebar

    });

  }

  
  
  // History search functionality

  if (historySearch) {

    historySearch.addEventListener('input', (e) => {

      const query = e.target.value.trim();

      renderHistory(query);

    });

    
    
    // Clear search on Escape key

    historySearch.addEventListener('keydown', (e) => {

      if (e.key === 'Escape') {

        historySearch.value = '';

        renderHistory('');

      }

    });

  }

  
  
  // History panel button functionality

  if (historyBtn && historyPanel) {
    
    // Toggle panel visibility on button click
    historyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      historyPanel.classList.toggle('visible');
    });

    // Close panel with close button
    if (closeHistoryBtn) {
      closeHistoryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        historyPanel.classList.remove('visible');
      });
    }

    // Close panel when clicking outside of it
    document.addEventListener('click', (e) => {
      // Don't close if clicking the history button or inside the panel
      if (historyPanel.classList.contains('visible')) {
        if (!historyPanel.contains(e.target) && e.target !== historyBtn && !historyBtn.contains(e.target)) {
          historyPanel.classList.remove('visible');
        }
      }
    });

    // Prevent panel from closing when clicking inside it
    historyPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
  }

  logoutBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    try {
      const response = await fetch('/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'same-origin'
      });
      if (!response.ok) {
        const message = await response.text().catch(() => 'Logout failed');
        showToast(message || 'Logout failed');
        return;
      }
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout error:', err);
      showToast('Logout failed. Please try again.');
    }
  });

});


// Frontend controller: upload/progress/stream + Player + Timestamp Filter


import { escapeHTML, parseAndPill, categoryClass, parseGeminiOutput, timeToSeconds, buildStructuredOutput } from './parser.js';


const form = document.getElementById('form');

const videoInput = document.getElementById('video');

const urlInput = document.getElementById('url');

const promptInput = document.getElementById('prompt');



const dropZone = document.getElementById('dropZone');

const browseBtn = document.getElementById('browseBtn');

const fileInfo = document.getElementById('fileInfo');



// Progress modal elements

const progressModal = document.getElementById('progressModal');

const progressStatus = document.getElementById('progressStatus');

const progressLinearBar = document.getElementById('progressLinearBar');
const progressConsole = document.getElementById('progressConsole') || document.getElementById('progressStreamPreview');

const closeProgressModal = document.getElementById('closeProgressModal');

const modalRetryBtn = document.getElementById('modalRetryBtn');

const streamPreview = document.getElementById('progressStreamPreview');



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
// === NEW: Validation Constants ===
const MAX_VIDEO_DURATION = 60 * 60; // 60 minutes in seconds
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes
// === END NEW ===



// === MODIFIED: Upload Progress Elements ===
const uploadProgressSection = document.getElementById('uploadProgressSection');
const uploadProgressLabel = document.getElementById('uploadProgressLabel');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const uploadProgressDetails = document.getElementById('uploadProgressDetails'); // Replaces Text and Speed
// === END MODIFIED ===



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
const adminBtn = document.getElementById('adminBtn');



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



// === NEW: Helper function to format bytes ===
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
// === END NEW ===

// === NEW: Unified File Validation Function ===
function handleFileSelect(file) {
  if (!file) return;

  if (!file.type.startsWith('video/')) {
    showToast('Error: Please select a video file.');
    videoInput.value = '';
    currentVideoFile = null;
    currentVideoFileName = null;
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
    showToast(`Error: File size (${sizeGB} GB) exceeds the 2 GB limit.`);
    videoInput.value = '';
    currentVideoFile = null;
    currentVideoFileName = null;
    if (fileInfo) {
      fileInfo.textContent = '';
      fileInfo.classList.add('hidden');
    }
    return;
  }

  submitBtn.disabled = true;
  showToast('Checking video duration...');

  currentVideoFile = null;
  currentVideoFileName = null;
  uploadTriggered = false;

  if (fileInfo) {
    fileInfo.textContent = '';
    fileInfo.classList.add('hidden');
  }

  if (player && player.src && player.src.startsWith('blob:')) {
    try { URL.revokeObjectURL(player.src); } catch (e) {}
  }

  const objectUrl = URL.createObjectURL(file);

  const cleanup = () => {
    player?.removeEventListener('loadedmetadata', onMetadataLoaded);
    player?.removeEventListener('error', onVideoError);
  };

  const onMetadataLoaded = () => {
    const duration = player.duration;
    if (duration > MAX_VIDEO_DURATION) {
      const durationMins = (duration / 60).toFixed(1);
      showToast(`Error: Video duration (${durationMins} min) exceeds the 60-minute limit.`);
      player.pause();
      player.removeAttribute('src');
      player.classList.add('hidden');
      try { URL.revokeObjectURL(objectUrl); } catch (e) {}
      videoInput.value = '';
      submitBtn.disabled = false;
      cleanup();
      return;
    }

    showToast(`Video OK (${(duration / 60).toFixed(1)} min). Ready to analyze.`);
    currentVideoFile = file;
    currentVideoFileName = file.name;

    if (fileInfo) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      fileInfo.textContent = `Selected file: ${file.name} (${sizeMB} MB)`;
      fileInfo.classList.remove('hidden');
    }

    submitBtn.disabled = false;
    cleanup();
  };

  const onVideoError = () => {
    showToast('Error: Could not read video file. It may be corrupt.');
    player.pause();
    player.removeAttribute('src');
    player.classList.add('hidden');
    try { URL.revokeObjectURL(objectUrl); } catch (e) {}
    videoInput.value = '';
    submitBtn.disabled = false;
    cleanup();
  };

  player.addEventListener('loadedmetadata', onMetadataLoaded);
  player.addEventListener('error', onVideoError);

  player.src = objectUrl;
  player.classList.remove('hidden');
  if (ytWrap) ytWrap.classList.add('hidden');
  if (ytFrame) ytFrame.removeAttribute('src');

  try { player.load?.(); } catch (e) {}
}
// === END NEW FUNCTION ===



// === HISTORY PANEL STATE ===
let historyCache = [];
let historyLoadedOnce = false;
let historyLoading = false;
let activeHistoryId = null;
let historySearchTimer = null;
// === END HISTORY PANEL STATE ===

let currentAnalysisAbort = null;



// === HISTORY PANEL HELPERS ===
function formatHistoryDate(timestamp) {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function fetchHistory(forceReload = false) {
  if (forceReload) {
    historyLoadedOnce = false;
  }
  if (historyLoading) return historyCache;
  if (historyLoadedOnce) return historyCache;

  historyLoading = true;
  try {
    const res = await fetch('/api/history', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      throw new Error(`History request failed (${res.status})`);
    }
    const data = await res.json();
    historyCache = Array.isArray(data) ? data : [];
    historyLoadedOnce = true;
    return historyCache;
  } catch (err) {
    console.error('Failed to fetch history:', err);
    showToast('Unable to load history. Please try again.');
    throw err;
  } finally {
    historyLoading = false;
  }
}

async function refreshHistoryStorage() {
  if (!historyStorageBar || !historyStorageText) return;
  try {
    const res = await fetch('/api/history/storage', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      throw new Error(`Storage request failed (${res.status})`);
    }
    const payload = await res.json();
    const usedBytes = Number(payload?.used) || 0;
    const percentUsed = Math.min(100, Math.round((usedBytes / TOTAL_STORAGE_BYTES) * 100));
    historyStorageBar.style.width = `${percentUsed}%`;
    historyStorageText.textContent = `${formatBytes(usedBytes, 1)} / ${formatBytes(TOTAL_STORAGE_BYTES, 0)}`;
  } catch (err) {
    console.error('Failed to fetch history storage info:', err);
  }
}

function updateHistorySelectionHighlight() {
  if (!historyList) return;
  const items = historyList.querySelectorAll('.history-item');
  items.forEach((node) => {
    if (String(node.dataset.historyId) === String(activeHistoryId)) {
      node.classList.add('active');
    } else {
      node.classList.remove('active');
    }
  });
}

function createHistoryListItem(entry) {
  const li = document.createElement('li');
  li.className = 'history-item';
  li.dataset.historyId = entry.id;
  if (String(entry.id) === String(activeHistoryId)) {
    li.classList.add('active');
  }
  const statusFailed = entry.status === 'failed';
  const statusClass = statusFailed ? 'status-failed' : 'status-complete';
  const statusIcon = statusFailed ? '⚠' : '✓';
  const statusLabel = statusFailed ? 'Failed' : 'Completed';
  const analysisName = entry.name || 'Untitled analysis';
  const userName = entry.analyzedBy || 'User';
  li.innerHTML = `
    <div class="history-item-title">${escapeHTML(analysisName)}</div>
    <div class="history-user">
      <span class="history-user-name-pill">${escapeHTML(userName)}</span>
      <span>${escapeHTML(formatHistoryDate(entry.createdAt))}</span>
    </div>
    <div class="history-status ${statusClass}">
      <span class="status-icon">${statusIcon}</span>
      <span>${statusLabel}</span>
    </div>
  `;
  li.addEventListener('click', () => handleHistoryItemSelection(entry.id));
  return li;
}

function loadHistoryEntry(entry) {
  if (!entry) return;

  const analysisText = entry.analysisText || '';
  if (resultsPre) {
    resultsPre.textContent = analysisText;
    resultsPre.scrollTop = 0;
  }
  buildStructuredOutputWrapper(analysisText);

  if (shareBtn) {
    shareBtn.disabled = analysisText.trim().length === 0;
  }

  // Switch to Results tab automatically when loading history
  if (mainTabs && mainTabs.length) {
    mainTabs.forEach(btn => btn.classList.remove('active'));
    const resultsMainTab = document.querySelector('[data-tab-main="results"]');
    if (resultsMainTab) resultsMainTab.classList.add('active');
  }
  if (mainTabContents && mainTabContents.length) {
    mainTabContents.forEach(content => content.classList.remove('active'));
    document.getElementById('tab-results-main')?.classList.add('active');
  }
  if (tabs && tabs.length) {
    tabs.forEach(tab => {
      if (tab.dataset.tab) {
        tab.classList.remove('active');
      }
    });
    document.querySelector('.tab[data-tab="structured"]')?.classList.add('active');
  }
  if (tabContents && tabContents.length) {
    tabContents.forEach(content => content.classList.remove('active'));
    document.getElementById('tab-structured')?.classList.add('active');
  }

  const videoUrl = entry.videoUrl || '';
  if (videoUrl) {
    const trimmedUrl = videoUrl.trim();
    const ytEmbed = toYouTubeEmbed(trimmedUrl);
    if (ytEmbed) {
      if (ytFrame) ytFrame.src = ytEmbed;
      if (ytWrap) ytWrap.classList.remove('hidden');
      if (player) {
        player.pause();
        player.removeAttribute('src');
        player.classList.add('hidden');
      }
    } else {
      if (player) {
        try {
          player.src = trimmedUrl;
          player.classList.remove('hidden');
          player.load?.();
        } catch (err) {
          console.warn('Could not load history video into player:', err);
        }
      }
      if (ytWrap) ytWrap.classList.add('hidden');
      if (ytFrame) ytFrame.removeAttribute('src');
    }
  } else {
    if (player) {
      player.pause();
      player.removeAttribute('src');
      player.classList.add('hidden');
    }
    if (ytFrame) ytFrame.removeAttribute('src');
    if (ytWrap) ytWrap.classList.add('hidden');
  }
}

function handleHistoryItemSelection(historyId) {
  const entry = historyCache.find(item => String(item.id) === String(historyId));
  if (!entry) return;
  activeHistoryId = entry.id;
  updateHistorySelectionHighlight();
  loadHistoryEntry(entry);
}

async function renderHistory(searchTerm = '', { forceReload = false } = {}) {
  if (!historyList) return [];
  let entries = [];
  try {
    entries = await fetchHistory(forceReload);
  } catch (err) {
    historyList.innerHTML = '<li class="history-empty muted">Failed to load history.</li>';
    return [];
  }

  const term = (searchTerm || '').trim().toLowerCase();
  const filtered = term
    ? entries.filter(item => {
        const name = (item.name || '').toLowerCase();
        const analyzedBy = (item.analyzedBy || '').toLowerCase();
        return name.includes(term) || analyzedBy.includes(term);
      })
    : entries.slice();

  historyList.innerHTML = '';

  if (filtered.length === 0) {
    const emptyMessage = document.createElement('li');
    emptyMessage.className = 'history-empty muted';
    emptyMessage.textContent = term ? 'No analyses match your search yet.' : 'No analyses saved yet.';
    historyList.appendChild(emptyMessage);
    activeHistoryId = null;
    return filtered;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach(entry => fragment.appendChild(createHistoryListItem(entry)));
  historyList.appendChild(fragment);

  if (!activeHistoryId || !filtered.some(item => String(item.id) === String(activeHistoryId))) {
    handleHistoryItemSelection(filtered[0].id);
  } else {
    updateHistorySelectionHighlight();
  }

  return filtered;
}

function isHistoryPanelVisible() {
  return historyPanel?.classList.contains('visible');
}

async function openHistoryPanel() {
  if (!historyPanel) return;
  historyPanel.classList.add('visible');
  try {
    await Promise.all([
      renderHistory(historySearch ? historySearch.value : '', { forceReload: true }),
      refreshHistoryStorage()
    ]);
  } catch {}
  if (historySearch) {
    historySearch.focus();
    historySearch.select();
  }
}

function closeHistoryPanel() {
  historyPanel?.classList.remove('visible');
}
// === END HISTORY PANEL HELPERS ===

async function initUserAccess() {
  if (!adminBtn) return;
  try {
    const res = await fetch('/api/user/me', { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.isAdmin) {
      adminBtn.classList.remove('hidden');
      adminBtn.addEventListener('click', () => {
        window.location.href = '/admin';
      }, { once: true });
    }
  } catch (err) {
    console.error('Failed to determine admin access:', err);
  }
}

initUserAccess();



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
}

// Checkpoint tracking

let currentCheckpoint = null;

const checkpointProgressBar = document.getElementById('checkpointProgressBar');



// Update checkpoint progress

function updateCheckpointProgress(percentage) {

  if (checkpointProgressBar) {

    checkpointProgressBar.style.width = `${percentage}%`;

  }

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

  const checkpoints = ['upload', 'process', 'analyze', 'complete', 'finalize'];

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

function setUpload(pct, label) {

  if (pct > 0 && progressModal.classList.contains('hidden')) {

    progressModal.classList.remove('hidden');

    progressModal.style.opacity = '1';

    // Clear stream preview and reset stats

    hideModalError(); // This resets the error state

    updateLiveStats(''); // Reset stats to 0

    // Reset checkpoints

    document.querySelectorAll('.checkpoint').forEach(cp => {

      cp.classList.remove('active', 'completed');

    });

    currentCheckpoint = null;

    updateCheckpointProgress(0);

  }

  
  

  if (pct <= 0 && !progressModal.classList.contains('hidden')) {

    progressModal.style.opacity = '0';

    setTimeout(() => {

      progressModal.classList.add('hidden');

      hideModalError(); // Also reset on close

      

      // Clear ETA timer

      if (etaTimer) clearInterval(etaTimer);

      const etaEl = document.getElementById('progressETA');

      if (etaEl) etaEl.style.display = 'none';

    }, 300);

  }

  // Robust numeric coercion for pct

  let numericPct = Number(pct);

  if (!isFinite(numericPct)) {

    const fromBar = progressLinearBar ? parseFloat(String(progressLinearBar.style.width || '0').replace('%','')) : NaN;

    numericPct = isFinite(fromBar) ? fromBar : 0;

  }

  const cleanPct = Math.max(0, Math.min(100, numericPct));

  
  
  if (progressLinearBar) {

    progressLinearBar.style.width = `${cleanPct}%`;

  }

  
  
  // Update checkpoint progress based on overall progress

  if (checkpointProgressBar && currentCheckpoint) {

    // Interpolate checkpoint progress based on overall progress

    const checkpoints = ['upload', 'process', 'analyze', 'complete', 'finalize'];

    const currentIndex = checkpoints.indexOf(currentCheckpoint);

    const baseProgress = (currentIndex / checkpoints.length) * 100;

    const checkpointRange = 100 / checkpoints.length;

    const withinCheckpoint = Math.min(100, Math.max(0, cleanPct - baseProgress));

    const checkpointProgress = baseProgress + (withinCheckpoint / checkpointRange) * (checkpointRange);

    updateCheckpointProgress(Math.min(100, checkpointProgress));

  }

  
  
  if (progressStatus && label && progressStatus.textContent !== label) {

    progressStatus.classList.remove('animate-fade-in');

    void progressStatus.offsetWidth;

    progressStatus.textContent = label;

    progressStatus.classList.add('animate-fade-in');

    // Note: Console logs are added explicitly in parseServerLine to show step-by-step

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

      setUpload(12, 'Downloading…');

      activateCheckpoint('upload');

    } else if (l.includes('uploading video to gemini')) {

      setUpload(20, 'Uploading to Gemini…');

      activateCheckpoint('upload');

    } else if (l.includes('upload complete')) {

      setUpload(30, 'Upload complete.');

      activateCheckpoint('process');

    } else if (l.includes('waiting for gemini')) {

      setUpload(45, 'Processing video…');

      activateCheckpoint('process');

    } else if (l.includes('file is active')) {

      setUpload(65, 'File is ACTIVE. Analyzing…');

      activateCheckpoint('analyze');

      if (streamPreview && streamPreview.textContent.includes('Waiting')) streamPreview.innerHTML = '';

    } else if (l.includes('analysis complete')) {

      setUpload(95, 'Analysis complete!');

      activateCheckpoint('complete');

    } else if (l.includes('finalizing')) {

      setUpload(97, 'Finalizing...');

      activateCheckpoint('finalize');

    } else if (l.includes('complete ✓')) {

      setUpload(100, 'Complete ✓');

      activateCheckpoint('finalize');

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
  videoInput.setAttribute('accept', 'video/*');
  videoInput.setAttribute('type', 'file');
  
  videoInput.addEventListener('change', (e) => {
    console.log('File input changed:', e.target.files);
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    } else {
      console.warn('No file selected');
      currentVideoFile = null;
      currentVideoFileName = null;
      submitBtn.disabled = false;
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

    const file = dt.files[0];

    try {

      const dataTransfer = new DataTransfer();

      dataTransfer.items.add(file);

      Object.defineProperty(videoInput, 'files', {

        value: dataTransfer.files,

        writable: false,

        configurable: true

      });

      videoInput.dispatchEvent(new Event('change', { bubbles: true }));

    } catch (err) {

      console.log('Using fallback file assignment');

      handleFileSelect(file);

    }

  }

});



historyBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (isHistoryPanelVisible()) {
    closeHistoryPanel();
  } else {
    await openHistoryPanel();
  }
});

closeHistoryBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  closeHistoryPanel();
});

if (historySearch) {
  historySearch.addEventListener('input', () => {
    if (historySearchTimer) clearTimeout(historySearchTimer);
    historySearchTimer = setTimeout(() => {
      renderHistory(historySearch.value);
    }, 250);
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isHistoryPanelVisible()) {
    closeHistoryPanel();
  }
});



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

  promptInput.value = '';

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

  // Clear active history item

  document.querySelectorAll('.history-item').forEach(el => {

    el.classList.remove('active');

  });

  // Switch to Analyze tab to start a new run

  mainTabs.forEach(b => b.classList.remove('active'));

  document.querySelector('[data-tab-main="analyze"]').classList.add('active');

  mainTabContents.forEach(c => c.classList.remove('active'));

  document.getElementById('tab-analyze-main').classList.add('active');

  // Clear saved file references

  currentVideoFile = null;

  currentVideoFileName = null;

  currentPromptText = null;

}



newAnalysisBtn?.addEventListener('click', startNewAnalysis);



clearBtn.addEventListener('click', () => {

  promptInput.value = '';

  urlInput.value = '';

  videoInput.value = '';

  fileInfo.textContent = '';

  fileInfo.classList.add('hidden');

  resultsPre.textContent = '';

  setUpload(0, 'Idle');

  player.pause();

  player.removeAttribute('src');

  player.classList.add('hidden');

  ytFrame.removeAttribute('src');

  ytWrap.classList.add('hidden');

  activeTsFilter = 'all';

  activeFilterPill.textContent = 'All';

  buildStructuredOutputWrapper(''); // Clear structured view
  tabs.forEach(t => t.classList.remove('active'));

  tabContents.forEach(c => c.classList.remove('active'));

  document.querySelector('.tab[data-tab="structured"]').classList.add('active');

  document.getElementById('tab-structured').classList.add('active');

  shareBtn.disabled = true;

  // Clear saved file references

  currentVideoFile = null;

  currentVideoFileName = null;

  currentPromptText = null;

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

let currentPromptText = null;

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

  
  
  const prompt = (promptInput.value || '').trim();

  const url = (urlInput.value || '').trim();

  // Get file from input OR from currentVideoFile (set by drag-and-drop fallback or file input change)
  const file = (videoInput.files && videoInput.files[0]) || currentVideoFile;

  
  // Validate file size before submitting (2GB limit)
  if (file) {
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB in bytes
    if (file.size > MAX_FILE_SIZE) {
      const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
      showToast(`File size (${sizeGB} GB) exceeds the 2 GB limit. Please select a smaller file.`);
      setUpload(0, 'Idle');
      return;
    }
  }
  
  // Save file reference and prompt for history saving later

  currentVideoFile = file || null;

  currentVideoFileName = file?.name || null;

  currentPromptText = prompt || null;



  console.log('Form data:', { hasFile: !!file, hasUrl: !!url, hasPrompt: !!prompt });



  resultsPre.textContent = '';

  setUpload(10, 'Preparing…'); // Start progress

  shareBtn.disabled = true;

  
  
  // Retry configuration

  const MAX_RETRIES = 3;

  let retryCount = 0;
  let analysisSucceeded = false;

  
  
  try {

    // Main retry loop for network errors

    while (retryCount < MAX_RETRIES) {

      try {

        await performAnalysis(prompt, url, file);

        analysisSucceeded = true;
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

    
    
    if (analysisSucceeded) {
      activeHistoryId = null;
      historyLoadedOnce = false;
      try {
        await renderHistory(historySearch ? historySearch.value : '', { forceReload: true });
        await refreshHistoryStorage();
      } catch (historyErr) {
        console.error('Failed to refresh history after analysis:', historyErr);
      }
    }

    // Hide modal after a delay on success

    setTimeout(() => {

      if (progressStatus && progressStatus.textContent.includes('Complete')) {

        setUpload(0, 'Idle'); // Hide modal

      }

    }, 3000);
    
    

  } catch (finalError) {

    // This catches errors after all retries are exhausted or non-network errors

    setUpload(0, 'Idle');

    if (finalError.userCancelled) {
      addConsoleLog('[Notice] Analysis cancelled by user.');
      showToast('Analysis cancelled.');
    } else {
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
    }

  } finally {

    submitBtn.disabled = false;

  }

}



// Separate function to perform the actual analysis

async function performAnalysis(prompt, url, file) {



  if (file && url) { 

    const msg = 'Provide either a file OR a YouTube URL, not both.';

    showToast(msg); 

    setUpload(0, 'Idle'); 

    throw new Error(msg); // Throw instead of return for retry logic

  }

  if (!file && !url) { 

    const msg = 'Please select a video or enter a YouTube URL.';

    showToast(msg); 

    setUpload(0, 'Idle'); 

    throw new Error(msg); // Throw instead of return for retry logic

  }

  let abortHandler = null;
  let userAborted = false;

  

  // Log file/URL info but don't spam console with it immediately

  if (file) {

    console.log('File selected:', file.name, file.size);

  } else if (url) {

    console.log('YouTube URL:', url);

  }



  // Player logic

  if (file) {

    const objUrl = URL.createObjectURL(file);

    player.src = objUrl;

    player.classList.remove('hidden');

    ytFrame.removeAttribute('src');

    ytWrap.classList.add('hidden');

  } else {

    const embed = toYouTubeEmbed(url);

    if (embed) {

      ytFrame.src = embed;

      ytWrap.classList.remove('hidden');

      player.pause();

      player.classList.add('hidden');

    }

  }



  let softTimer = null;

  let softPct = 78; // This is the "streaming" start percentage

  let activityTimer = null; // Declare early to avoid "not defined" errors

  let hasReceivedData = false;

  let lastActivityTime = Date.now();

  const ACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes timeout



  try {

    submitBtn.disabled = true;

    setUpload(12, 'Submitting…');



    const fd = new FormData();

    fd.append('prompt', prompt || '');

    if (file) {

      fd.append('video', file);

      console.log('FormData: Added video file', file.name);

    }

    if (url) {

      fd.append('url', url);

      console.log('FormData: Added URL', url);

    }

    console.log('FormData entries:', Array.from(fd.entries()).map(([k, v]) => [k, v instanceof File ? v.name : v]));



    console.log('Fetching /upload...', { hasFile: !!file, hasUrl: !!url });
    updateStep(url ? 'Connecting to server (YouTube)...' : 'Connecting to server (local file)...');
    
    // === REFACTOR: Replaced FETCH with XHR for upload progress ===
    
    // Variables for upload progress
    let lastUploadTime = Date.now();
    let lastLoadedBytes = 0;
    
    // Variables for response stream processing
    let lastResponseLength = 0;
    
    // Show upload section if we have a file
    if (file && uploadProgressSection) {
        uploadProgressSection.classList.remove('hidden');
        if (uploadProgressLabel) uploadProgressLabel.textContent = `Uploading ${file.name}...`;
        if (uploadProgressBar) uploadProgressBar.style.width = '0%';
        const totalMB = (file.size / (1024 * 1024)).toFixed(0);
        if (uploadProgressDetails) uploadProgressDetails.textContent = `(0mb/${totalMB}mb) --- MB/S`;
    }
    
    // Reset activity tracking for this new stream
    hasReceivedData = false;
    lastActivityTime = Date.now();
    
    try {
      const xhr = new XMLHttpRequest();
      const controller = new AbortController(); // Keep AbortController for timeouts

      await new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId = null;

        const finalize = (fn) => {
          if (settled) return;
          settled = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (activityTimer) {
            clearInterval(activityTimer);
            activityTimer = null;
          }
          if (softTimer) {
            clearInterval(softTimer);
            softTimer = null;
          }
          if (currentAnalysisAbort === abortHandler) {
            currentAnalysisAbort = null;
          }
          fn();
        };

        const fail = (message, { stepLabel, consoleMessage, toastMessage, errorObject, isErrorStep = true } = {}) => {
          if (stepLabel) updateStep(stepLabel, true, isErrorStep);
          if (consoleMessage) addConsoleLog(consoleMessage);
          if (toastMessage) showToast(toastMessage);
          const errorToThrow = errorObject || new Error(message);
          finalize(() => reject(errorToThrow));
        };

        abortHandler = () => {
          if (userAborted) return;
          userAborted = true;
          if (progressStatus) progressStatus.textContent = 'Cancelling…';
          updateStep('Cancelling analysis...', false);
          showToast('Cancelling analysis…');
          try { controller.abort(); } catch {}
          try { xhr.abort(); } catch {}
        };
        currentAnalysisAbort = abortHandler;

        timeoutId = setTimeout(() => {
          controller.abort();
        }, 300000000000000000000); // 30 sec timeout (kept from original)

        controller.signal.onabort = () => {
          if (userAborted) {
            fail('Analysis cancelled by user', {
              stepLabel: 'Analysis cancelled',
              consoleMessage: '[Notice] Analysis cancelled by user',
              errorObject: Object.assign(new Error('Analysis cancelled by user'), { userCancelled: true }),
              isErrorStep: false
            });
          } else {
            xhr.abort();
            fail('Connection timeout', {
              stepLabel: 'Connection timeout',
              consoleMessage: `[Error] Connection timeout: Server did not respond within 30 seconds`,
              toastMessage: 'Connection timeout. The server may be overloaded or unreachable. Please try again.'
            });
          }
        };
    
        xhr.upload.onprogress = (event) => {
          if (userAborted) return;
          if (event.lengthComputable && file) {
            const now = Date.now();
            const elapsed = (now - lastUploadTime) / 1000; // seconds
            const bytesLoaded = event.loaded - lastLoadedBytes;
            
            lastUploadTime = now;
            lastLoadedBytes = event.loaded;
            
            const percent = (event.loaded / event.total) * 100;
            
            if (uploadProgressBar) uploadProgressBar.style.width = `${percent}%`;
            
            const loadedLabel = formatBytes(event.loaded, 0).toLowerCase().replace(/\s+/g, '');
            const totalLabel = formatBytes(event.total, 0).toLowerCase().replace(/\s+/g, '');
            const progressString = `(${loadedLabel}/${totalLabel})`;
            
            let speedString = '--- MB/S';
            if (elapsed > 0.5 && bytesLoaded > 0) {
              const speed = bytesLoaded / elapsed; // bytes/sec
              const speedLabel = formatBytes(speed, 1).toUpperCase().replace(/\s+/g, '');
              speedString = `${speedLabel}/S`;
            }
            
            if (uploadProgressDetails) {
              uploadProgressDetails.textContent = `${progressString} ${speedString}`;
            }
            
            const overallPercent = percent * 0.18; // 18% of the bar is for upload
            setUpload(12 + overallPercent, 'Uploading to Gemini…');
          }
        };
    
        xhr.onprogress = () => {
          if (userAborted) return;
          const response = xhr.responseText || '';
          if (!response) return;
    
          if (!activityTimer) {
            activityTimer = setInterval(() => {
              const timeSinceActivity = Date.now() - lastActivityTime;
              const minutesSinceActivity = Math.round(timeSinceActivity / 60000);
              if (timeSinceActivity > ACTIVITY_TIMEOUT) {
                clearInterval(activityTimer);
                activityTimer = null;
                xhr.abort();
                fail('Analysis timeout - no activity from server', {
                  stepLabel: 'Analysis timed out. Please try again.',
                  consoleMessage: `[Error] Timeout: No activity from server for ${minutesSinceActivity} minutes`,
                  toastMessage: 'Analysis timed out. Please try again.'
                });
              } else if (timeSinceActivity > 3 * 60 * 1000) {
                if (currentStepElement && !currentStepElement.textContent.includes('minutes')) {
                  updateStep(`Waiting for Gemini... (${minutesSinceActivity} minutes)`);
                }
              }
            }, 30000);
          }
    
          if (response.length <= lastResponseLength) return;
    
          const chunk = response.substring(lastResponseLength);
          lastResponseLength = response.length;
    
          lastActivityTime = Date.now();
          hasReceivedData = true;
    
          if (!chunk) return;
    
          resultsPre.textContent += chunk;
          resultsPre.scrollTop = resultsPre.scrollHeight;
    
          const lines = chunk.split(/\r?\n/);
          for (const line of lines) {
            if (!line.trim()) continue;
            parseServerLine(line);
          }
    
          if (progressStatus && (progressStatus.textContent.includes('Streaming') || progressStatus.textContent.includes('Analyzing'))) {
            updateStreamingContent(resultsPre.textContent);
    
            if (!softTimer) {
              const currentPct = progressLinearBar ? parseFloat(String(progressLinearBar.style.width || '78').replace('%','')) : 78;
              softPct = Math.max(softPct, currentPct);
              softTimer = setInterval(() => {
                if (softPct < 92) {
                  softPct += 1;
                  setUpload(softPct, progressStatus.textContent); // Keep label, update percent
                }
              }, 400); // Slower, smoother animation
            }
          }
          
          buildStructuredOutputWrapper(resultsPre.textContent);
        };
    
        xhr.onload = () => {
          if (userAborted) return;
          const status = xhr.status;
          if (status >= 200 && status < 300) {
            if (etaTimer) clearInterval(etaTimer);
            const etaEl = document.getElementById('progressETA');
            if (etaEl) {
              etaEl.textContent = 'Finishing up...';
            }
            finalize(() => resolve(xhr.responseText || ''));
          } else {
            const ct = xhr.getResponseHeader('content-type') || '';
            let msg = `Error ${status}`;
            if (ct.includes('application/json')) {
              try {
                const parsed = JSON.parse(xhr.responseText || '{}');
                if (parsed?.message) msg += `: ${parsed.message}`;
              } catch (err) {
                if (xhr.statusText) msg += `: ${xhr.statusText}`;
              }
            } else if (xhr.responseText) {
              msg += `: ${xhr.responseText}`;
            } else if (xhr.statusText) {
              msg += `: ${xhr.statusText}`;
            }
            fail(msg, {
              stepLabel: 'Server error',
              consoleMessage: `[Error] Server error: ${msg}`,
              toastMessage: msg
            });
          }
        };
    
        xhr.onerror = () => {
          if (userAborted) return;
          fail('Network error', {
            stepLabel: 'Connection failed',
            consoleMessage: `[Error] Network error: ${xhr.statusText || 'Unknown error'}`,
            toastMessage: `Failed to connect to server: ${xhr.statusText || 'Network error'}`
          });
        };
    
        activityTimer = null; // reset before potential new interval
    
        xhr.open('POST', '/upload', true);
        xhr.send(fd);
        
        console.log('XHR request sent to /upload');
        updateStep('Connected. Starting analysis...', true);
        setTimeout(() => updateStep('Initializing...'), 300);
      });
    } catch (xhrError) {
      console.error('XHR Promise error:', xhrError);
      throw xhrError;
    }
    
    // === END REFACTOR ===

    if (uploadProgressSection) {
      uploadProgressSection.classList.add('hidden');
      if (uploadProgressDetails) uploadProgressDetails.textContent = '';
    }

  } catch (err) {

    if (uploadProgressSection) {
      uploadProgressSection.classList.add('hidden');
      if (uploadProgressDetails) uploadProgressDetails.textContent = '';
    }

    clearInterval(softTimer);

    if (activityTimer) clearInterval(activityTimer);
    
    // Clear ETA timer
    if (etaTimer) clearInterval(etaTimer);

    

    // Don't reset UI if this is a network error (will be retried by outer handler)

    const errorMsg = err.message || 'Unknown error occurred';

    const isNetworkError = errorMsg.includes('Network error') || 

                          errorMsg.includes('Failed to fetch') ||

                          errorMsg.includes('Connection timeout') ||

                          errorMsg.includes('Connection failed') ||

                          err.name === 'AbortError';
    
    

    // Only reset UI for non-network errors (validation, server errors, etc.)

    if (!isNetworkError) {

      setUpload(0, 'Idle');

    }

    
    
    addConsoleLog(`[Error] ${errorMsg}`);

    console.error('Analysis error:', err);
    
    
    // After errors, wait a bit for server to save failed job, then reload history
    if (!isNetworkError) {
      historyLoadedOnce = false;
      setTimeout(async () => {
        try {
          await renderHistory(historySearch ? historySearch.value : '', { forceReload: true });
          await refreshHistoryStorage();
        } catch (historyErr) {
          console.error('Failed to reload history after error:', historyErr);
        }
      }, 2000);
    }

    // Re-throw the error so retry logic can handle it

    throw err;

  } finally {

    // Note: submitBtn will be re-enabled in outer handleSubmit after retries are exhausted
    if (currentAnalysisAbort === abortHandler) {
      currentAnalysisAbort = null;
    }

  }

}



// Close modal button handler

closeProgressModal?.addEventListener('click', () => {

  hideModalError(); // Ensure error state is cleared

  if (currentAnalysisAbort) {
    currentAnalysisAbort();
  } else {
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

    buildStructuredOutputWrapper(resultsPre.textContent);

  }

});
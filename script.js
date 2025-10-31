// Frontend controller: upload/progress/stream + Player + Timestamp Filter

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
const progressConsole = document.getElementById('progressConsole');
const closeProgressModal = document.getElementById('closeProgressModal');

const resultsPre = document.getElementById('results');
const timestampCardsContainer = document.getElementById('timestampCards');
const summaryEl = document.getElementById('summary');
const metaBody = document.getElementById('metaBody');
const metaTableWrap = document.getElementById('meta');

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
const newAnalysisBtnSide = document.getElementById('newAnalysisBtnSide');

// History panel elements
const historyList = document.getElementById('historyList');
const historySearch = document.getElementById('historySearch');
const historyStorageBar = document.getElementById('historyStorageBar');
const historyStorageText = document.getElementById('historyStorageText');
const TOTAL_STORAGE_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB

let uploadTriggered = false;

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

// New progress modal controller
function setUpload(pct, label) {
  if (pct > 0 && progressModal.classList.contains('hidden')) {
    progressModal.classList.remove('hidden');
    progressModal.style.opacity = '1';
    // Clear console and reset step tracking
    if (progressConsole) {
      progressConsole.innerHTML = '';
      currentStepElement = null;
    }
    // Reset checkpoints
    document.querySelectorAll('.checkpoint').forEach(cp => {
      cp.classList.remove('active', 'completed');
    });
    currentCheckpoint = null;
    updateCheckpointProgress(0);
  }
  
  // Clear streaming content when progress resets or starts fresh
  if (pct <= 0 && progressConsole) {
    const streamingContent = progressConsole.querySelector('.streaming-content');
    if (streamingContent) streamingContent.remove();
  }
  if (pct <= 0 && !progressModal.classList.contains('hidden')) {
    progressModal.style.opacity = '0';
    setTimeout(() => {
      progressModal.classList.add('hidden');
      if (progressConsole) {
        progressConsole.innerHTML = '';
      }
      // Reset checkpoints
      document.querySelectorAll('.checkpoint').forEach(cp => {
        cp.classList.remove('active', 'completed');
      });
      currentCheckpoint = null;
      updateCheckpointProgress(0);
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
  const l = line.toLowerCase().trim();
  const originalLine = line.trim();
  
  // Skip empty lines
  if (!originalLine) return;
  
  // Handle queue position messages specifically
  if (originalLine.startsWith('[Notice]') && l.includes('queued') && l.includes('position')) {
    const positionMatch = originalLine.match(/Position:\s*(\d+)/i);
    const position = positionMatch ? positionMatch[1] : '?';
    setUpload(5, `Queued… Position: ${position}`);
    updateStep(`Queued. Waiting in line... Position: ${position}`);
    addConsoleLog(originalLine); // Also log it
    return;
  }
  
  // Handle other notice/error markers
  if (originalLine.startsWith('[Notice]') || originalLine.startsWith('[Error]')) {
    addConsoleLog(originalLine);
    return;
  }
  
  // Update progress and steps based on server messages (general queue check - less specific)
  if ((l.includes('queued') || l.includes('queue')) && !l.includes('position')) {
    setUpload(5, 'Queued…');
    updateStep('Queued. Waiting in line...');
  }
  if (l.includes('downloading youtube video') || l.includes('downloading video')) { 
    setUpload(12, 'Downloading video…');
    updateStep('Downloading video from YouTube...');
    activateCheckpoint('upload'); // Always activate upload checkpoint for YouTube downloads
    updateCheckpointProgress(20); // Start of upload checkpoint
  }
  if (l.includes('download complete')) { 
    setUpload(15, 'Download complete.');
    updateStep('Video downloaded successfully', true);
    setTimeout(() => updateStep('Preparing video for analysis...'), 500);
  }
  if (l.includes('uploading video to gemini') || l.includes('uploading video') || l.includes('submitting')) { 
    setUpload(20, 'Uploading to Gemini…');
    updateStep('Uploading video to Gemini...');
    activateCheckpoint('upload'); // Always activate upload checkpoint (for both local files and YouTube)
    updateCheckpointProgress(40); // Mid-upload progress
  }
  if (l.includes('upload complete')) {
    setUpload(30, 'Upload complete. Processing...');
    updateStep('Video uploaded successfully', true);
    activateCheckpoint('process');
    updateCheckpointProgress(40); // Transition from upload to process (2nd checkpoint out of 5 = 40%)
    setTimeout(() => updateStep('Processing video file...'), 500);
  }
  if (l.includes('waiting for gemini') || l.includes('processing the file') || l.includes('waiting for')) { 
    setUpload(45, 'Waiting for ACTIVE…');
    updateStep('Waiting for Gemini to process video...');
    // Keep on process checkpoint during waiting
    if (!currentCheckpoint || currentCheckpoint === 'upload') activateCheckpoint('process');
  }
  if (l.includes('file is active') || (l.includes('active') && !l.includes('waiting'))) { 
    setUpload(65, 'ACTIVE. Analyzing…');
    updateStep('Video processing complete', true);
    activateCheckpoint('analyze');
    updateCheckpointProgress(60); // Transition to analyze checkpoint (3rd out of 5 = 60%)
    setTimeout(() => updateStep('Starting AI analysis...'), 500);
  }
  if (l.includes('starting analysis') || l.includes('gemini 2.5 pro')) { 
    setUpload(78, 'Streaming…');
    updateStep('Analyzing video with AI...');
    activateCheckpoint('analyze');
    // Clear any previous streaming content
    if (progressConsole) {
      const streamingContent = progressConsole.querySelector('.streaming-content');
      if (streamingContent) streamingContent.remove();
    }
  }
  if (l.includes('streaming') && !l.includes('starting')) {
    // Already showing streaming, just update progress
    setUpload(78, 'Streaming…');
  }
  if (l.includes('error') || l.includes('failed')) {
    updateStep('Error occurred', true, true);
    addConsoleLog(`[Error] ${originalLine}`);
  }
}

browseBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent event from bubbling to dropzone
  videoInput.click();
});

videoInput.addEventListener('change', () => {
  if (videoInput.files.length > 0) {
    const file = videoInput.files[0];
    fileInfo.textContent = `Selected file: ${file.name}`;
    fileInfo.classList.remove('hidden');
    uploadTriggered = false;
    ytWrap.classList.add('hidden');
    ytFrame.removeAttribute('src');
    const url = URL.createObjectURL(file);
    player.src = url;
    player.classList.remove('hidden');
  }
});

['dragenter', 'dragover'].forEach(ev => {
  dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('hover'); });
});
['dragleave', 'drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('hover'); });
});
dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  if (dt && dt.files && dt.files[0]) {
    videoInput.files = dt.files;
    videoInput.dispatchEvent(new Event('change'));
  }
});

// Allow clicking the dropzone to open file dialog
dropZone.addEventListener('click', (e) => {
  // Don't trigger if clicking the browse button (it has its own handler)
  if (e.target === browseBtn || e.target.closest('#browseBtn')) {
    return;
  }
  // Only trigger if clicking the dropzone area itself
  videoInput.click();
});

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
  // Switch to Analyze tab to start a new run
  mainTabs.forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab-main="analyze"]').classList.add('active');
  mainTabContents.forEach(c => c.classList.remove('active'));
  document.getElementById('tab-analyze-main').classList.add('active');
  // Clear saved file references
  currentVideoFile = null;
  currentVideoFileName = null;
}

newAnalysisBtn?.addEventListener('click', startNewAnalysis);
newAnalysisBtnSide?.addEventListener('click', startNewAnalysis);

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
  buildStructuredOutput(''); // Clear structured view
  tabs.forEach(t => t.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));
  document.querySelector('.tab[data-tab="structured"]').classList.add('active');
  document.getElementById('tab-structured').classList.add('active');
  shareBtn.disabled = true;
  // Clear saved file references
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

// Function to handle form submission with automatic retry for network errors
async function handleSubmit(e) {
  if (e) e.preventDefault();
  
  console.log('Submit button clicked - handleSubmit called');
  
  const prompt = (promptInput.value || '').trim();
  const url = (urlInput.value || '').trim();
  const file = videoInput.files && videoInput.files[0];
  
  // Save file reference for history saving later
  currentVideoFile = file || null;
  currentVideoFileName = file?.name || null;

  console.log('Form data:', { hasFile: !!file, hasUrl: !!url, hasPrompt: !!prompt });

  resultsPre.textContent = '';
  setUpload(10, 'Preparing…'); // Start progress
  shareBtn.disabled = true;
  
  // Retry configuration
  const MAX_RETRIES = 3;
  let retryCount = 0;
  
  try {
    // Main retry loop for network errors
    while (retryCount < MAX_RETRIES) {
      try {
        await performAnalysis(prompt, url, file);
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
    
    // Hide modal after a delay on success
    setTimeout(() => {
      if (progressStatus && progressStatus.textContent.includes('Complete')) {
        setUpload(0, 'Idle'); // Hide modal
      }
    }, 3000);
    
  } catch (finalError) {
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
    let res;
    try {
      // Add timeout for fetch request (30 seconds for initial connection)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 300000000000000000000); // 30 second timeout
      
      res = await fetch('/upload', { 
        method: 'POST', 
        body: fd,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      console.log('Fetch response:', res.status, res.statusText, {
        contentType: res.headers.get('content-type'),
        hasBody: !!res.body,
        bodyUsed: res.bodyUsed
      });
      
      updateStep('Connected. Starting analysis...', true);
      setTimeout(() => updateStep('Initializing...'), 300);
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      
      // Handle abort/timeout specifically
      if (fetchError.name === 'AbortError') {
        updateStep('Connection timeout', true, true);
        addConsoleLog(`[Error] Connection timeout: Server did not respond within 30 seconds`);
        showToast('Connection timeout. The server may be overloaded or unreachable. Please try again.');
      } else {
        updateStep('Connection failed', true, true);
        addConsoleLog(`[Error] Network error: ${fetchError.message}`);
        showToast(`Failed to connect to server: ${fetchError.message}`);
      }
      throw new Error(`Network error: ${fetchError.message}`);
    }
    
    if (!res.ok) {
      const ct = res.headers.get('content-type') || '';
      let msg = `Error ${res.status}`;
      try {
        if (ct.includes('application/json')) { 
          const j = await res.json(); 
          if (j?.message) msg += `: ${j.message}`; 
        } else { 
          msg += `: ${await res.text()}`; 
        }
      } catch (e) {
        msg += `: ${res.statusText || 'Unknown error'}`;
      }
      addConsoleLog(`Server error: ${msg}`);
      showToast(msg);
      throw new Error(msg);
    }
    
    // Validate response body exists
    if (!res.body) {
      const errorMsg = 'Server response has no body. The server may have encountered an error.';
      console.error('No response body:', res);
      updateStep('Server error: No response body', true, true);
      addConsoleLog(`[Error] ${errorMsg}`);
      showToast(errorMsg);
      setUpload(0, 'Idle');
      return;
    }
    
    console.log('Response body available, starting stream read...');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    
    // Reset activity tracking for this new stream
    hasReceivedData = false;
    lastActivityTime = Date.now();

    // Set up activity monitoring - warn if no activity for a while
    activityTimer = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTime;
      const minutesSinceActivity = Math.round(timeSinceActivity / 60000);
      if (timeSinceActivity > ACTIVITY_TIMEOUT) {
        clearInterval(activityTimer);
        clearInterval(softTimer);
        updateStep('Analysis timed out. Please try again.', true, true);
        addConsoleLog(`[Error] Timeout: No activity from server for ${minutesSinceActivity} minutes`);
        showToast('Analysis timed out. Please try again.');
        reader.cancel().catch(() => {});
        throw new Error('Analysis timeout - no activity from server');
      } else if (timeSinceActivity > 3 * 60 * 1000) {
        // Warn after 3 minutes of no activity - update the current step
        if (currentStepElement && !currentStepElement.textContent.includes('minutes')) {
          updateStep(`Waiting for Gemini... (${minutesSinceActivity} minutes)`);
        }
      }
    }, 30000); // Check every 30 seconds

    console.log('Entering stream read loop...');
    while (true) {
      let readResult;
      try {
        readResult = await reader.read();
        console.log('Read chunk:', { done: readResult.done, hasValue: !!readResult.value });
      } catch (readError) {
        if (activityTimer) clearInterval(activityTimer);
        console.error('Stream read error:', readError);
        updateStep('Stream read error', true, true);
        addConsoleLog(`[Error] Stream read error: ${readError.message}`);
        showToast(`Stream error: ${readError.message}`);
        throw readError;
      }
      
      const { value, done } = readResult;
      if (done) {
        console.log('Stream finished (done = true)');
        if (activityTimer) clearInterval(activityTimer);
        break;
      }
      
      if (!value) {
        console.warn('Received chunk with no value, continuing...');
        continue;
      }
      
      // Update activity time when we receive data
      lastActivityTime = Date.now();
      hasReceivedData = true;
      
      let chunk = null;
      try {
        chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          resultsPre.textContent += chunk;
          resultsPre.scrollTop = resultsPre.scrollHeight;
          console.log('Decoded chunk length:', chunk.length);
        }
      } catch (decodeError) {
        console.error('Decode error:', decodeError);
        continue; // Skip this chunk but continue reading
      }

      // Check for server-sent progress lines
      // Process lines individually as they come from the server
      if (chunk) {
        const lines = chunk.split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          // This will add console logs and update progress step by step
          // Each line from the server is logged as it arrives
          parseServerLine(line);
        }
      }
      
      // Update streaming content preview during analysis
      if (progressStatus && (progressStatus.textContent.includes('Streaming') || progressStatus.textContent.includes('Analyzing'))) {
        updateStreamingContent(resultsPre.textContent);
      }

      // Check if we are in the "Streaming" phase
      if (progressStatus && (progressStatus.textContent.includes('Streaming') || progressStatus.textContent.includes('Analyzing'))) {
          // Start the "soft" timer if it's not already running
          if (!softTimer) {
              // Get current progress from the bar itself
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
      
      buildStructuredOutput(resultsPre.textContent);
    }

    clearInterval(softTimer);
    if (activityTimer) clearInterval(activityTimer);
    
    if (!hasReceivedData) {
      updateStep('Warning: No data received from server', true, true);
      showToast('Analysis completed but no results received');
    } else {
      setUpload(95, 'Analysis complete!');
      updateStep('Analysis complete! Processing results...', true);
      activateCheckpoint('complete');
      updateCheckpointProgress(80); // 4/5 = 80% (complete checkpoint)
      
      // Final streaming content summary
      if (progressConsole && resultsPre.textContent.trim().length > 0) {
        updateStreamingContent(resultsPre.textContent);
      }
      
      // Activate finalize checkpoint before saving and loading video
      setUpload(97, 'Finalizing...');
      updateStep('Preparing video player and saving results...', false);
      activateCheckpoint('finalize');
      updateCheckpointProgress(90); // Start of finalize checkpoint
    }

    // Add to history and finalize video loading
    if (resultsPre.textContent.trim().length > 0) {
        shareBtn.disabled = false;
        
        // Save to history (this may upload local video file if needed)
        if (typeof localforage !== 'undefined') {
          updateStep('Saving analysis to history...', false);
          await addHistoryItem(resultsPre.textContent);
        }
        
        // Ensure video is loaded in player (for local files, ensure object URL is still valid)
        // For YouTube videos, they should already be loaded, but we ensure it's visible
        if (currentVideoFile) {
          updateStep('Loading video into player...', false);
          // Recreate object URL if needed for local files
          try {
            // Check if player already has a valid src
            if (!player.src || player.src === window.location.href) {
              const objUrl = URL.createObjectURL(currentVideoFile);
              player.src = objUrl;
            }
            player.classList.remove('hidden');
            ytFrame.removeAttribute('src');
            ytWrap.classList.add('hidden');
            // Small delay to ensure video is ready
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (videoError) {
            console.warn('Could not reload local video:', videoError);
          }
        } else if (urlInput && urlInput.value.trim()) {
          // For YouTube videos, ensure embed is visible
          updateStep('Loading video into player...', false);
          const embed = toYouTubeEmbed(urlInput.value.trim());
          if (embed) {
            ytFrame.src = embed;
            ytWrap.classList.remove('hidden');
            player.classList.add('hidden');
          }
          // Small delay to ensure iframe is ready
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        // Auto-switch to results tab
        updateStep('Opening results view...', false);
        mainTabs.forEach(b => b.classList.remove('active'));
        document.querySelector('[data-tab-main="results"]').classList.add('active');
        mainTabContents.forEach(c => c.classList.remove('active'));
        document.getElementById('tab-results-main').classList.add('active');

        // Ensure inner results tab shows Structured by default
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        document.querySelector('.tab[data-tab="structured"]').classList.add('active');
        document.getElementById('tab-structured').classList.add('active');
        
        // Mark finalize as complete
        setUpload(100, 'Complete ✓');
        updateStep('Everything is ready!', true);
        activateCheckpoint('finalize');
        updateCheckpointProgress(100);
        
        // Add celebration message
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

  } catch (err) {
    clearInterval(softTimer);
    if (activityTimer) clearInterval(activityTimer);
    
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
    
    // Re-throw the error so retry logic can handle it
    throw err;
  } finally {
    // Note: submitBtn will be re-enabled in outer handleSubmit after retries are exhausted
  }
}

// Close modal button handler
closeProgressModal?.addEventListener('click', () => {
  setUpload(0, 'Idle');
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

function escapeHTML(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Convert simple markdown-like markers to styled pills/tags
function parseAndPill(text) {
  const safe = escapeHTML(text || '');
  // **bold** -> strong pill
  let out = safe.replace(/\*\*(.+?)\*\*/g, (_m, p1) => `<strong class="pill-strong">${p1}</strong>`);
  // Lines starting with * item -> pill-item block
  out = out.replace(/^\*\s+(.+)$/gm, (_m, p1) => `<div class="pill-item">${p1}</div>`);
  // Newlines to <br>
  out = out.replace(/\r?\n/g, '<br>');
  return out;
}

function categoryClass(category) {
  const c = (category || '').toLowerCase();
  if (/911/.test(c)) return 'cat-911';
  if (/investigation/.test(c)) return 'cat-investigation';
  if (/interrogation/.test(c)) return 'cat-interrogation';
  if (/cctv|footage/.test(c)) return 'cat-cctv';
  if (/body\s*cam/.test(c)) return 'cat-bodycam';
  return '';
}

function parseGeminiOutput(text) {
    if (!text) return { metadata: {}, timestamps: [], summary: '' };

    const lines = text.split(/\r?\n/);
    let metadata = {};
    let timestamps = [];
    let summary = '';

    let currentSection = '';
    let currentCategory = 'General';

    // A helper to strip asterisks and whitespace from the start/end
    const clean = (s) => (s || '').trim().replace(/^[\*\s]+|[\*\s]+$/g, '');

    for (const line of lines) {
        const trimmedLine = line.trim();
        const upperLine = trimmedLine.toUpperCase();

        if (trimmedLine.length === 0) continue;

        // *** FIX IS HERE: Reverted from startsWith to includes ***
        if (upperLine.includes('METADATA') && !upperLine.includes('EXTRACTION')) {
            currentSection = 'METADATA';
            continue;
        } else if (upperLine.includes('TIMESTAMPS')) {
            currentSection = 'TIMESTAMPS';
            continue;
        } else if (upperLine.includes('SUMMARY') || upperLine.includes('STORYLINE')) {
            currentSection = 'SUMMARY';
            
            // Clean the header line itself
            let summaryPart = line.split(/AND STORYLINE|SUMMARY/i).pop() || '';
            summaryPart = summaryPart.replace(/^[\*\s:]+/g, ''); // Remove `**:`
            
            if (summaryPart.trim()) {
                summary += summaryPart.trim() + '\n';
            }
            continue;
        }

        switch (currentSection) {
            case 'METADATA':
                const metaMatch = trimmedLine.match(/^[\*\-\s]*([^:]+?)\s*:\s*(.*)/);
                
                if (metaMatch && metaMatch[2] && metaMatch[2].trim()) {
                    const key = clean(metaMatch[1]);
                    const value = clean(metaMatch[2]);
                    
                    if (key && value && !/\[extracted.*\]/i.test(value)) {
                         metadata[key] = value;
                    }
                }
                break;

            case 'TIMESTAMPS':
                // Check for category header (lines without brackets or timestamps)
                const categoryMatch = trimmedLine.match(/^\s*(?:\*{1,3}|#{1,3}|\d+\.?)\s*([A-Z0-9\s/&-]+?)\s*(?:\*{1,3}|:)?\s*$/i);
                if (categoryMatch && !trimmedLine.includes('[') && !trimmedLine.includes('-')) { 
                    const newCategory = clean(categoryMatch[1]);
                    if (newCategory) {
                        currentCategory = newCategory;
                    }
                    continue; 
                }
                // Match timestamp format: [MM:SS] or [MM:SS - MM:SS] - Description
                // Also handle formats like: [00:15] Description (without dash)
                const tsMatch = trimmedLine.match(/\[([^\]]+)\]\s*-?\s*(.+)?/);
                if (tsMatch) {
                    const timePart = clean(tsMatch[1]);
                    let description = (tsMatch[2] || '').trim();
                    
                    // If no description but we have a time, try to extract from next line or use default
                    if (!description || description.length === 0) {
                        description = 'Timestamp marker';
                    }
                    
                    let finalCategory = clean(currentCategory) || 'General';
                    
                    // If description starts with category name, extract it
                    if (description.includes('-')) {
                        const descParts = description.split(/\s*-\s*/);
                        if (descParts.length > 1) {
                            const firstPart = descParts[0].trim();
                            if (firstPart.toUpperCase() === finalCategory.toUpperCase()) {
                                description = descParts.slice(1).join(' - ').trim();
                            } else if (categoryClass(firstPart)) {
                                // First part might be a category
                                finalCategory = firstPart;
                                description = descParts.slice(1).join(' - ').trim();
                            }
                        }
                    }
                    
                    timestamps.push({
                        time: timePart,
                        category: finalCategory || 'General',
                        description: clean(description) || 'No description'
                    });
                }
                break;

            case 'SUMMARY':
                summary += line + '\n';
                break;
        }
    }
    
    // Final cleanup of the whole summary string
    const finalSummary = summary.trim().replace(/^[\*\s]+|[\*\s]+$/g, '');
    
    return { metadata, timestamps, summary: finalSummary };
}


function buildStructuredOutput(text) {
  if (!text || !text.trim()) {
    // Clear everything if no text
    if (timestampCardsContainer) timestampCardsContainer.innerHTML = '';
    if (summaryEl) summaryEl.innerHTML = '—';
    if (metaTableWrap) metaTableWrap.classList.add('hidden');
    return;
  }

  const { metadata, timestamps, summary } = parseGeminiOutput(text);
  
  console.log('buildStructuredOutput:', {
    textLength: text.length,
    timestampsCount: timestamps.length,
    timestamps: timestamps.slice(0, 3), // Show first 3 for debugging
    hasMetadata: Object.keys(metadata).length > 0,
    hasSummary: !!summary,
    textPreview: text.substring(0, 500) // First 500 chars for debugging
  });

  if (summaryEl) {
    summaryEl.innerHTML = parseAndPill(summary || '—');
  }

  if (Object.keys(metadata).length > 0) {
    if (metaTableWrap) metaTableWrap.classList.remove('hidden');
    if (metaBody) {
      let metaHtml = '';
      for (const [key, value] of Object.entries(metadata)) {
        metaHtml += `<tr><td><span class="pill-key">${escapeHTML(key)}</span></td><td>${parseAndPill(value)}</td></tr>`;
      }
      metaBody.innerHTML = metaHtml;
    }
  } else {
    if (metaTableWrap) metaTableWrap.classList.add('hidden');
    if (metaBody) metaBody.innerHTML = '';
  }
  
  // Normalize timestamps to ensure ranges: if no end time, use next start time
  const normalized = (() => {
    if (timestamps.length === 0) return [];
    
    const withStart = timestamps.map((t, i) => ({ ...t, __idx: i, __start: timeToSeconds(t.time) }));
    const sorted = [...withStart].sort((a, b) => a.__start - b.__start);
    const idxToDisplay = new Map();
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const raw = String(cur.time || '');
      if (/\s-\s/.test(raw)) { // already a range
        idxToDisplay.set(cur.__idx, raw);
        continue;
      }
      const next = sorted[i + 1];
      if (next && isFinite(next.__start) && next.__start > cur.__start) {
        // Build HH:MM or MM:SS string for next start based on digits in current
        const toLabel = (secs) => {
          const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = Math.floor(secs % 60);
          if (h > 0) return `${String(h).padStart(1, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
          return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };
        const display = `${raw} - ${toLabel(next.__start)}`;
        idxToDisplay.set(cur.__idx, display);
      } else {
        idxToDisplay.set(cur.__idx, raw); // leave as-is for last item
      }
    }
    return withStart.map(t => ({ ...t, displayTime: idxToDisplay.get(t.__idx) || t.time }));
  })();

  const grouped = normalized.reduce((acc, ts) => {
    const cat = (ts.category || 'General').trim();
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(ts);
    return acc;
  }, {});

  console.log('Grouped timestamps:', Object.keys(grouped).length, 'categories', Object.keys(grouped));

  let cardsHtml = '';
  for (const [category, items] of Object.entries(grouped)) {
    if (!category || !items || items.length === 0) continue;
    if (!passesFilter(category)) continue;
    
    const catClass = categoryClass(category);
    
    const rows = items.map(it => {
      const label = escapeHTML(it.displayTime || it.time || '');
      const desc = escapeHTML(it.description || '');
      return `<div class="timestamp-card ${catClass}"><div class="ts-time-pill"><button class="link ts-jump" data-ts="${label}" style="border: none; background: none; padding: 0; cursor: pointer;"><span class="pill-time">${label}</span></button></div><p class="ts-desc">${desc}</p></div>`;
    }).join('');
    
    if (rows) {
      const categoryUpper = escapeHTML(category.toUpperCase());
      cardsHtml += `<div class="timestamp-card-group"><h2 class="timestamp-category-title ${catClass}">${categoryUpper}</h2><div class="timestamp-card-list">${rows}</div></div>`;
    }
  }
  
  // Ensure timestampCardsContainer exists before setting innerHTML
  if (timestampCardsContainer) {
    // Check if we have timestamps but they were filtered out
    const hasTimestamps = timestamps && timestamps.length > 0;
    const hasFilteredResults = cardsHtml && cardsHtml.trim().length > 0;
    
    if (!hasTimestamps) {
      timestampCardsContainer.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">No timestamps detected yet.</div>`;
    } else if (!hasFilteredResults && activeTsFilter !== 'all') {
      const filterName = filterLabel(activeTsFilter);
      timestampCardsContainer.innerHTML = `<div class="muted" style="padding: 20px; text-align: center;">No timestamps found for "${filterName}" category.</div>`;
    } else {
      timestampCardsContainer.innerHTML = cardsHtml || `<div class="muted" style="padding: 20px; text-align: center;">No timestamps detected yet.</div>`;
    }
    
    // Show the timestamps section if we have cards or if we're showing a message
    const timestampsSection = document.getElementById('timestamps');
    if (timestampsSection) {
      if (hasTimestamps) {
        timestampsSection.classList.remove('hidden');
        console.log('✅ Timestamps section shown, cards:', cardsHtml ? cardsHtml.substring(0, 100) : 'no cards');
      } else {
        timestampsSection.classList.add('hidden');
        console.log('⚠️ No timestamp cards generated, hiding section');
      }
    } else {
      console.warn('⚠️ timestamps section element not found');
    }
  } else {
    console.error('❌ timestampCardsContainer not found');
  }
}

function timeToSeconds(ts) {
  // Get just the start time, e.g., "00:45 - 01:00" -> "00:45"
  const startTime = (ts || '').split(' - ')[0].trim(); 
  
  const parts = (startTime || '').split(':').map(x => parseInt(x, 10));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
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
    buildStructuredOutput(resultsPre.textContent);
  } else {
    console.warn('⚠️ No analysis text available to filter');
  }
});


function filterLabel(val) {
  switch (val) {
    case '911_call': return '911 Call';
    case 'investigation': return 'Investigation';
    case 'interrogation': return 'Interrogation';
    case 'cctv': return 'CCTV';
    case 'body_cam': return 'Body Cam';
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
  if (activeTsFilter === 'cctv') {
    return /cctv|footage|surveillance|security\s*camera/.test(c);
  }
  if (activeTsFilter === 'body_cam') {
    return /body\s*cam|bodycam|body\s*camera|officer\s*cam/.test(c);
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
      const timestamp = item.createdAt || (item.date ? new Date(item.date).getTime() : parseInt(item.id));
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      
      // Relative time for recent items
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
      
      // Add time if less than a day old
      if (diffDays < 1) {
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        dateTimeText += ` • ${timeStr}`;
      }
    }
    
    li.innerHTML = `
      <div class="history-item-content">
        <span class="history-name pill-tag" title="${item.name}">
          <span class="pill-name-text">${escapeHTML(item.name)}</span>
          ${dateTimeText ? `<span class="pill-date-text">${escapeHTML(dateTimeText)}</span>` : ''}
        </span>
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
    `;
    historyList.appendChild(li);
  }
  await updateHistoryStorageUI();
}

async function addHistoryItem(analysisText) {
  if (!analysisText) return;
  
  // Use saved file reference or try to get from input
  const file = currentVideoFile || (videoInput.files && videoInput.files[0]);
  let url = (urlInput.value || '').trim();
  let fileName = currentVideoFileName || file?.name;
  
  // If we have a local file, upload it to shared directory to get a permanent URL
  if (!url && file) {
    console.log('Uploading local video to VPS storage...', { fileName: file.name, fileSize: file.size });
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
  
  const name = fileName || (url ? (url.split('=')[1] || url) : `Analysis ${new Date().toLocaleString()}`);
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
});

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.history-menu')) {
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
        const resp = await fetch(`/api/history/${id}`, { method: 'DELETE' });
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

  // Load item (do not wipe results globally; reset inputs only)
  resetInputsOnly();
  resultsPre.textContent = item.analysisText;
  buildStructuredOutput(item.analysisText);
  
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
      urlInput.value = '';
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
  
  // History panel hover functionality
  const historyHoverZone = document.getElementById('historyHoverZone');
  const historyPanel = document.getElementById('historyPanel');
  const newAnalysisBtnSide = document.getElementById('newAnalysisBtnSide');
  let hoverTimeout = null;
  
  if (historyHoverZone && historyPanel) {
    const updateButtonPosition = (panelVisible) => {
      if (newAnalysisBtnSide) {
        if (panelVisible) {
          newAnalysisBtnSide.style.left = '310px';
        } else {
          newAnalysisBtnSide.style.left = '30px';
        }
      }
    };
    
    // Show panel when mouse enters hover zone
    historyHoverZone.addEventListener('mouseenter', () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      historyPanel.style.transform = 'translateX(0)';
      updateButtonPosition(true);
    });
    
    // Keep panel visible when hovering over it
    historyPanel.addEventListener('mouseenter', () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      historyPanel.style.transform = 'translateX(0)';
      updateButtonPosition(true);
    });
    
    // Hide panel with slight delay when mouse leaves
    historyPanel.addEventListener('mouseleave', () => {
      hoverTimeout = setTimeout(() => {
        historyPanel.style.transform = 'translateX(-100%)';
        updateButtonPosition(false);
      }, 200);
    });
    
    // Also hide when leaving hover zone (if not entering panel)
    historyHoverZone.addEventListener('mouseleave', (e) => {
      // Check if mouse is moving to panel
      const relatedTarget = e.relatedTarget;
      if (!relatedTarget || !historyPanel.contains(relatedTarget)) {
        hoverTimeout = setTimeout(() => {
          historyPanel.style.transform = 'translateX(-100%)';
          updateButtonPosition(false);
        }, 200);
      }
    });
    
    // Initialize button position
    updateButtonPosition(false);
  }
});

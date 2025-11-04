// viewer.js - Logic for the view-only page with optional player

import { escapeHTML, parseAndPill, categoryClass, parseGeminiOutput, timeToSeconds, buildStructuredOutput } from './parser.js';

const resultsPre = document.getElementById('results');
const timestampCardsContainer = document.getElementById('timestampCards');
const summaryEl = document.getElementById('summary');
const metaBody = document.getElementById('metaBody');
const metaTableWrap = document.getElementById('meta');
const sharedPlayer = document.getElementById('sharedPlayer');
const ytWrap = document.getElementById('ytWrap');
const ytFrame = document.getElementById('ytFrame');
const videoNotice = document.getElementById('videoNotice');

// buildStructuredOutput wrapper that passes the correct context (no filter in viewer)
function buildStructuredOutputWrapper(text) {
  return buildStructuredOutput(
    text,
    timestampCardsContainer,
    summaryEl,
    metaTableWrap,
    metaBody,
    () => true, // passesFilter - always true in viewer (no filtering)
    () => '' // filterLabel - not used in viewer
  );
}


// Main logic on page load
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get share ID from URL path (e.g., /share/abc123)
    const pathParts = window.location.pathname.split('/');
    const shareId = pathParts[pathParts.length - 1];
    
    if (!shareId || shareId === 'view.html' || shareId === 'share') {
      // Fallback: try to read from hash (old format for backwards compatibility)
      const hash = window.location.hash.substring(1);
      if (hash) {
        try {
          const decompressed = LZString.decompressFromEncodedURIComponent(hash);
          const data = JSON.parse(decompressed);
          if (data.analysisText) {
            loadAnalysisData(data);
            return;
          }
        } catch {}
      }
      throw new Error("No share ID found in URL.");
    }
    
    // Fetch shared analysis from server
    const resp = await fetch(`/api/share/${shareId}`);
    if (!resp.ok) {
      if (resp.status === 404) {
        throw new Error("This shared analysis link is invalid or has expired.");
      }
      throw new Error(`Server error: ${resp.status}`);
    }
    
    const data = await resp.json();
    if (!data.analysisText) {
      throw new Error("Invalid analysis data format.");
    }
    
    loadAnalysisData(data);

  } catch (err) {
    summaryEl.textContent = `Error: Could not load shared analysis. ${err.message}`;
    summaryEl.style.color = 'var(--err)';
    console.error('Load error:', err);
  }
});

// Timestamp click handler for video seeking
if (timestampCardsContainer) {
  timestampCardsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.ts-jump');
    if (!btn) return;
    const ts = btn.getAttribute('data-ts') || '';
    const secs = timeToSeconds(ts);
    if (!isNaN(secs) && secs >= 0) {
      // Try local video player first
      if (sharedPlayer && !sharedPlayer.classList.contains('hidden')) {
        try {
          sharedPlayer.currentTime = secs;
          sharedPlayer.play().catch(() => {});
        } catch (err) {
          console.error('Error seeking local video:', err);
        }
      } else if (ytWrap && !ytWrap.classList.contains('hidden') && ytFrame) {
        // YouTube video - need to reload with start parameter
        try {
          const cur = ytFrame.getAttribute('src') || '';
          if (cur) {
            const url = new URL(cur.split('?')[0]);
            url.searchParams.set('start', String(Math.floor(secs)));
            url.searchParams.set('autoplay', '1');
            ytFrame.src = url.toString();
          }
        } catch (err) {
          console.error('Error seeking YouTube video:', err);
        }
      }
    }
  });
}

// Tab switching functionality
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab');
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const targetContent = document.getElementById(`tab-${tabName}`);
    if (targetContent) targetContent.classList.add('active');
  });
});

function loadAnalysisData(data) {
  console.log('Loading analysis data:', {
    hasAnalysisText: !!data.analysisText,
    analysisTextLength: data.analysisText?.length || 0,
    hasVideoUrl: !!data.videoUrl,
    videoUrl: data.videoUrl,
    fileName: data.fileName
  });
  
  // Set the raw text and build the structured output
  if (resultsPre && data.analysisText) {
    resultsPre.textContent = data.analysisText;
    console.log('Set resultsPre text, now calling buildStructuredOutput');
    buildStructuredOutputWrapper(data.analysisText);
  } else {
    console.error('resultsPre not found or no analysisText');
  }

  // Load video if available
  if (data.videoUrl) {
    try {
      // Handle both absolute and relative URLs
      let videoUrl = data.videoUrl;
      if (videoUrl.startsWith('/shared/')) {
        // Relative URL - convert to absolute
        videoUrl = new URL(videoUrl, window.location.origin).href;
      }
      
      const url = new URL(videoUrl);
      const host = url.hostname.replace(/^www\./, '');
      let embed = '';
      
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        const v = url.searchParams.get('v');
        if (v) embed = `https://www.youtube.com/embed/${v}`;
      } else if (host === 'youtu.be') {
        const id = url.pathname.split('/').filter(Boolean)[0];
        if (id) embed = `https://www.youtube.com/embed/${id}`;
      }
      
      if (embed) {
        // YouTube video
        console.log('Loading YouTube video:', embed);
        ytFrame.src = embed;
        ytWrap.classList.remove('hidden');
        if (sharedPlayer) sharedPlayer.classList.add('hidden');
        if (videoNotice) videoNotice.classList.add('hidden');
      } else {
        // Local video file (served from /shared/)
        console.log('Loading local video:', videoUrl);
        // Use the processed URL (either absolute or converted from relative)
        sharedPlayer.src = videoUrl;
        sharedPlayer.classList.remove('hidden');
        ytWrap.classList.add('hidden');
        if (videoNotice) videoNotice.classList.add('hidden');
      }
    } catch (err) {
      console.error('Video load error:', err);
      // Try to load as-is even if URL parsing fails (for relative URLs)
      if (data.videoUrl.startsWith('/shared/')) {
        console.log('Attempting to load video with relative URL:', data.videoUrl);
        sharedPlayer.src = data.videoUrl;
        sharedPlayer.classList.remove('hidden');
        ytWrap.classList.add('hidden');
        if (videoNotice) videoNotice.classList.add('hidden');
      } else {
        if (videoNotice) {
          videoNotice.textContent = `Error loading video: ${err.message}`;
          videoNotice.classList.remove('hidden');
        }
      }
    }
  } else if (data.fileName) {
    if (videoNotice) {
      videoNotice.textContent = `Video file: ${data.fileName} (not included in share)`;
      videoNotice.classList.remove('hidden');
    }
  } else {
    if (videoNotice) videoNotice.classList.add('hidden');
  }
}

// viewer.js - Logic for the view-only page with optional player

const resultsPre = document.getElementById('results');
const timestampCardsContainer = document.getElementById('timestampCards');
const summaryEl = document.getElementById('summary');
const metaBody = document.getElementById('metaBody');
const metaTableWrap = document.getElementById('meta');
const sharedPlayer = document.getElementById('sharedPlayer');
const ytWrap = document.getElementById('ytWrap');
const ytFrame = document.getElementById('ytFrame');
const videoNotice = document.getElementById('videoNotice');

function escapeHTML(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Match main UI formatting: bolds and list items to pills/tags
function parseAndPill(text) {
  const safe = escapeHTML(text || '');
  let out = safe.replace(/\*\*(.+?)\*\*/g, (_m, p1) => `<strong class="pill-strong">${p1}</strong>`);
  out = out.replace(/^\*\s+(.+)$/gm, (_m, p1) => `<div class="pill-item">${p1}</div>`);
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

    // Strip leading/trailing asterisks and whitespace (prevents raw * in output)
    const clean = (s) => (s || '').trim().replace(/^[\*\s]+|[\*\s]+$/g, '');

    for (const line of lines) {
        const trimmedLine = line.trim();
        const upperLine = trimmedLine.toUpperCase();
        if (trimmedLine.length === 0) continue;

        if (upperLine.includes('METADATA') && !upperLine.includes('EXTRACTION')) { currentSection = 'METADATA'; continue; }
        if (upperLine.includes('TIMESTAMPS')) { currentSection = 'TIMESTAMPS'; continue; }
        if (upperLine.includes('SUMMARY') || upperLine.includes('STORYLINE')) {
            currentSection = 'SUMMARY';
            let summaryPart = line.split(/AND STORYLINE|SUMMARY/i).pop() || '';
            summaryPart = summaryPart.replace(/^[\*\s:]+/g, '');
            if (summaryPart.trim()) { summary += summaryPart.trim() + '\n'; }
            continue;
        }

        switch (currentSection) {
            case 'METADATA': {
                const metaMatch = trimmedLine.match(/^[\*\-\s]*([^:]+?)\s*:\s*(.*)/);
                if (metaMatch && metaMatch[2] && metaMatch[2].trim()) {
                    const key = clean(metaMatch[1]);
                    const value = clean(metaMatch[2]);
                    if (key && value && !/\[extracted.*\]/i.test(value)) { metadata[key] = value; }
                }
                break;
            }
            case 'TIMESTAMPS': {
                // Check for category header (lines without brackets)
                const categoryMatch = trimmedLine.match(/^\s*(?:\*{1,3}|#{1,3}|\d+\.?)\s*([A-Z0-9\s/&-]+?)\s*(?:\*{1,3}|:)?\s*$/i);
                if (categoryMatch && !trimmedLine.includes('[') && !trimmedLine.includes('-')) { 
                    currentCategory = clean(categoryMatch[1]) || currentCategory; 
                    continue; 
                }
                // Match timestamp format: [MM:SS] or [MM:SS - MM:SS] - Description
                const tsMatch = trimmedLine.match(/\[([^\]]+)\]\s*-\s*(.+)/);
                if (tsMatch) {
                    let description = clean(tsMatch[2]);
                    let finalCategory = clean(currentCategory) || 'General';
                    // If description starts with category name, extract it
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
                    timestamps.push({ 
                        time: clean(tsMatch[1]), 
                        category: finalCategory, 
                        description: clean(description) 
                    });
                }
                break;
            }
            case 'SUMMARY': {
                summary += line + '\n';
                break;
            }
        }
    }
    const finalSummary = summary.trim().replace(/^[\*\s]+|[\*\s]+$/g, '');
    return { metadata, timestamps, summary: finalSummary };
}

function buildStructuredOutput(text) {
  if (!text || !text.trim()) {
    console.warn('buildStructuredOutput called with empty text');
    return;
  }
  
  console.log('Building structured output from text, length:', text.length);
  const { metadata, timestamps, summary } = parseGeminiOutput(text);
  
  console.log('Parsed data:', {
    metadataCount: Object.keys(metadata).length,
    timestampCount: timestamps.length,
    summaryLength: summary.length
  });
  
  // Update summary
  if (summaryEl) {
    summaryEl.innerHTML = parseAndPill(summary || '—');
  } else {
    console.error('summaryEl not found');
  }
  
  // Update metadata
  if (metaTableWrap && metaBody) {
    if (Object.keys(metadata).length > 0) {
      metaTableWrap.classList.remove('hidden');
      let metaHtml = '';
      for (const [key, value] of Object.entries(metadata)) {
        metaHtml += `<tr><td><span class="pill-key">${escapeHTML(key)}</span></td><td>${parseAndPill(value)}</td></tr>`;
      }
      metaBody.innerHTML = metaHtml;
    } else {
      metaTableWrap.classList.add('hidden');
      metaBody.innerHTML = '';
    }
  } else {
    console.error('metaTableWrap or metaBody not found');
  }
  
  // Normalize ranges: if only a start time is present, use next start as end
  const normalized = (() => {
    const withStart = timestamps.map((t, i) => ({ ...t, __idx: i, __start: timeToSeconds(t.time) }));
    const sorted = [...withStart].sort((a, b) => a.__start - b.__start);
    const idxToDisplay = new Map();
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const raw = String(cur.time || '');
      if (/\s-\s/.test(raw)) { idxToDisplay.set(cur.__idx, raw); continue; }
      const next = sorted[i + 1];
      if (next && isFinite(next.__start) && next.__start > cur.__start) {
        const toLabel = (secs) => {
          const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60); const s = Math.floor(secs % 60);
          if (h > 0) return `${String(h).padStart(1,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
          return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        };
        idxToDisplay.set(cur.__idx, `${raw} - ${toLabel(next.__start)}`);
      } else {
        idxToDisplay.set(cur.__idx, raw);
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
  
  console.log('Grouped timestamps:', Object.keys(grouped).length, 'categories');
  
  let cardsHtml = '';
  for (const [category, items] of Object.entries(grouped)) {
    if (!category || !items || items.length === 0) continue;
    const catClass = categoryClass(category);
    
    const rows = items.map(it => {
        const label = escapeHTML(it.displayTime || it.time || '');
        const desc = escapeHTML(it.description || '');
        return `<div class="timestamp-card ${catClass}"><h3><button class="link ts-jump" data-ts="${label}"><span class="pill-time">${label}</span></button></h3><p class="ts-desc">${desc}</p></div>`;
    }).join('');
    if (rows) {
      cardsHtml += `<div class="timestamp-card-group"><h2 class="panel-title">${escapeHTML(category)}</h2><div class="timestamp-card-list">${rows}</div></div>`;
    }
  }
  
  console.log('Generated cards HTML length:', cardsHtml.length);
  
  // Ensure timestampCardsContainer exists before setting innerHTML
  if (timestampCardsContainer) {
    timestampCardsContainer.innerHTML = cardsHtml || `<div class="muted">No timestamps found.</div>`;
    console.log('Updated timestampCardsContainer with', cardsHtml.length > 0 ? 'content' : 'empty message');
  } else {
    console.error('timestampCardsContainer not found in viewer');
  }
}

function timeToSeconds(ts) {
  const startTime = (ts || '').split(' - ')[0].trim();
  const parts = (startTime || '').split(':').map(x => parseInt(x, 10));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
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
    buildStructuredOutput(data.analysisText);
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

const params = new URLSearchParams(window.location.search);
const token = params.get('token');

const tokenInput   = document.getElementById('token');
const analyzeForm  = document.getElementById('analyzeForm');
const promptInput  = document.getElementById('prompt');

const submitBtn    = document.getElementById('submitBtn');
const clearBtn     = document.getElementById('clearBtn');

const analysisBar  = document.getElementById('analysisBar');
const analysisText = document.getElementById('analysisText');
const stepper      = document.getElementById('stepper');
const statusLog    = document.getElementById('statusLog');

const resultsPre   = document.getElementById('results');        // exact raw stream
const cleanPre     = document.getElementById('resultsClean');   // cleaned text view

// Card container and filter controls
const cardsWrap    = document.getElementById('cardsWrap');
const showMetadata = document.getElementById('showMetadata');
const showTimestamps = document.getElementById('showTimestamps');
const showSummary = document.getElementById('showSummary');

const toast       = document.getElementById('toast');
const themeToggle = document.getElementById('themeToggle');

if(!token){ alert('Missing token. Please re-upload your video.'); window.location.href = './'; }

(function initTheme(){
  const saved = localStorage.getItem('vat-theme');
  if(saved) document.documentElement.setAttribute('data-theme', saved);
})();
themeToggle.addEventListener('click', ()=>{
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('vat-theme', next);
});

function showToast(msg){ toast.textContent = msg; toast.classList.remove('hidden'); setTimeout(()=>toast.classList.add('hidden'), 2000); }
function log(line){ const t=new Date().toLocaleTimeString(); statusLog.textContent += `[${t}] ${line}\n`; statusLog.scrollTop=statusLog.scrollHeight; }
function setBar(pct, label){ analysisBar.style.width = `${pct}%`; analysisText.textContent = label; }
function setStep(stage){
  stepper.querySelectorAll('.step').forEach(li => li.classList.remove('done','active'));
  const order=['upload','waiting','active','stream']; const idx=order.indexOf(stage);
  order.forEach((k,i)=>{ const el=stepper.querySelector(`[data-step="${k}"]`); if(!el) return; if(idx<0) return; if(i<idx) el.classList.add('done'); if(i===idx) el.classList.add('active'); });
}
function parseServerLine(line){
  const l = line.toLowerCase();
  if (l.includes('uploading video to gemini')) { setStep('upload');  setBar(20,'Uploading to Gemini…'); }
  if (l.includes('waiting for gemini'))       { setStep('waiting'); setBar(45,'Waiting for ACTIVE…'); }
  if (l.includes('file is active'))           { setStep('active');  setBar(65,'ACTIVE. Starting analysis…'); }
  if (l.includes('starting analysis'))        { setStep('stream');  setBar(75,'Streaming…'); }
}

tokenInput.value = token;

/* =========================
   ENHANCED PARSING FOR GEMINI OUTPUT
   ========================= */

function escapeHTML(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function makeCardHTML(title, bodyHTML, cardId = ''){
  return `
    <section class="card card-compact" ${cardId ? `id="${cardId}"` : ''}>
      <div class="card-header"><h3>${title}</h3></div>
      <div class="card-body">${bodyHTML}</div>
    </section>
  `;
}

function parseGeminiOutput(text) {
  if (!text) return { metadata: null, timestamps: [], summary: null };
  
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  // Parse METADATA section
  let metadata = null;
  let metadataStart = -1;
  let metadataEnd = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase().includes('METADATA')) {
      metadataStart = i;
      // Find end of metadata section
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].toUpperCase().includes('TIMESTAMP') || 
            lines[j].toUpperCase().includes('SUMMARY') ||
            lines[j].toUpperCase().includes('FORMAT')) {
          metadataEnd = j;
          break;
        }
      }
      break;
    }
  }
  
  if (metadataStart !== -1) {
    const metadataLines = lines.slice(metadataStart + 1, metadataEnd === -1 ? lines.length : metadataEnd);
    metadata = parseMetadataSection(metadataLines);
  }
  
  // Parse TIMESTAMPS section
  const timestamps = [];
  let timestampStart = -1;
  let timestampEnd = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase().includes('TIMESTAMP')) {
      timestampStart = i;
      // Find end of timestamp section
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].toUpperCase().includes('SUMMARY') || 
            lines[j].toUpperCase().includes('STORYLINE')) {
          timestampEnd = j;
          break;
        }
      }
      break;
    }
  }
  
  if (timestampStart !== -1) {
    const timestampLines = lines.slice(timestampStart + 1, timestampEnd === -1 ? lines.length : timestampEnd);
    timestamps.push(...parseTimestampSection(timestampLines));
  }
  
  // Parse SUMMARY section
  let summary = null;
  let summaryStart = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase().includes('SUMMARY') || lines[i].toUpperCase().includes('STORYLINE')) {
      summaryStart = i;
      break;
    }
  }
  
  if (summaryStart !== -1) {
    const summaryLines = lines.slice(summaryStart + 1);
    summary = summaryLines.join('\n').trim();
  }
  
  return { metadata, timestamps, summary };
}

function parseMetadataSection(lines) {
  const metadata = {};
  
  for (const line of lines) {
    if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      if (value && value !== '[extracted date/time information]' && 
          value !== '[extracted location details]' && 
          value !== '[extracted geographic information]' && 
          value !== '[extracted agency information]') {
        metadata[key.trim()] = value;
      }
    }
  }
  
  return Object.keys(metadata).length > 0 ? metadata : null;
}

function parseTimestampSection(lines) {
  const timestamps = [];
  let currentCategory = '';
  
  for (const line of lines) {
    // Check if this is a category header (like "1. 911 CALLS:")
    const categoryMatch = line.match(/^\d+\.\s*([A-Z\s/&-]+):?\s*$/i);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      continue;
    }
    
    // Check if this is a timestamp line (format: [MM:SS] - Description)
    const timestampMatch = line.match(/\[(\d{1,2}:\d{2})\]\s*-\s*(.+)/);
    if (timestampMatch) {
      timestamps.push({
        time: timestampMatch[1],
        category: currentCategory || 'General',
        description: timestampMatch[2].trim()
      });
    }
    
    // Also check for other timestamp formats
    const altTimestampMatch = line.match(/(\d{1,2}:\d{2})\s*-\s*(.+)/);
    if (altTimestampMatch && !timestampMatch) {
      timestamps.push({
        time: altTimestampMatch[1],
        category: currentCategory || 'General',
        description: altTimestampMatch[2].trim()
      });
    }
  }
  
  return timestamps;
}

function renderMetadataCard(metadata) {
  if (!metadata) return '';
  
  let html = '';
  for (const [key, value] of Object.entries(metadata)) {
    html += `<div class="kv"><div class="kv-k">${escapeHTML(key)}:</div><div class="kv-v">${escapeHTML(value)}</div></div>`;
  }
  
  return makeCardHTML('METADATA', html, 'metadata-card');
}

function renderTimestampCards(timestamps) {
  if (!timestamps.length) return '';
  
  // Group timestamps by category
  const grouped = {};
  for (const ts of timestamps) {
    if (!grouped[ts.category]) {
      grouped[ts.category] = [];
    }
    grouped[ts.category].push(ts);
  }
  
  let html = '';
  for (const [category, categoryTimestamps] of Object.entries(grouped)) {
    let categoryHtml = '';
    for (const ts of categoryTimestamps) {
      categoryHtml += `<div class="kv"><div class="kv-k">[${ts.time}]</div><div class="kv-v">${escapeHTML(ts.description)}</div></div>`;
    }
    html += makeCardHTML(category.toUpperCase(), categoryHtml, `timestamp-${category.toLowerCase().replace(/\s+/g, '-')}`);
  }
  
  return html;
}

function renderSummaryCard(summary) {
  if (!summary) return '';
  
  const html = `<div class="summary-content">${escapeHTML(summary).replace(/\n/g, '<br>')}</div>`;
  return makeCardHTML('SUMMARY AND STORYLINE', html, 'summary-card');
}

function buildCardsFromOutput(text) {
  cardsWrap.innerHTML = '';
  if (!text) return;
  
  const { metadata, timestamps, summary } = parseGeminiOutput(text);
  
  // Render metadata if enabled
  if (showMetadata.checked && metadata) {
    cardsWrap.insertAdjacentHTML('beforeend', renderMetadataCard(metadata));
  }
  
  // Render timestamps if enabled
  if (showTimestamps.checked && timestamps.length > 0) {
    cardsWrap.insertAdjacentHTML('beforeend', renderTimestampCards(timestamps));
  }
  
  // Render summary if enabled
  if (showSummary.checked && summary) {
    cardsWrap.insertAdjacentHTML('beforeend', renderSummaryCard(summary));
  }
}

function beautifyRaw(text){
  let out = text || '';
  out = out.replace(/\r\n/g, '\n');
  out = out.replace(/```([\s\S]*?)```/g, (_,inner)=>inner);
  out = out.replace(/\*\*(.*?)\*\*/g, '$1');
  out = out.replace(/(^|\s)\*(?!\s)([^*]+?)\*(?=\s|$)/g, '$1$2');
  out = out.replace(/^######\s+(.*)$/gim, (_,t)=>`\n${t.toUpperCase()}\n`);
  out = out.replace(/^#####\s+(.*)$/gim,  (_,t)=>`\n${t.toUpperCase()}\n`);
  out = out.replace(/^####\s+(.*)$/gim,   (_,t)=>`\n${t.toUpperCase()}\n`);
  out = out.replace(/^###\s+(.*)$/gim,    (_,t)=>`\n${t.toUpperCase()}\n`);
  out = out.replace(/^##\s+(.*)$/gim,     (_,t)=>`\n${t.toUpperCase()}\n`);
  out = out.replace(/^#\s+(.*)$/gim,      (_,t)=>`\n${t.toUpperCase()}\n`);
  out = out.replace(/^\s*---+\s*$/gim, '\n');
  out = out.replace(/^\s*[\*\-]\s+/gim, '• ');
  out = out.replace(/^\s*\*\s{2,}/gim, '• ');
  out = out.replace(/^\s*>\s?/gim, '');
  out = out.replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function refreshViews(){
  const original = resultsPre.textContent || '';
  const cleaned  = beautifyRaw(original);
  cleanPre.textContent = cleaned;
  buildCardsFromOutput(original);
}

showMetadata.addEventListener('change', refreshViews);
showTimestamps.addEventListener('change', refreshViews);
showSummary.addEventListener('change', refreshViews);

clearBtn.addEventListener('click', ()=>{
  promptInput.value='';
  resultsPre.textContent='';
  cleanPre.textContent='';
  cardsWrap.innerHTML = '';
  statusLog.textContent='';
  setBar(0,'Idle');
  showToast('Cleared.');
});

document.getElementById('copyBtn').addEventListener('click', async ()=>{
  const text = cleanPre.textContent;
  try{ await navigator.clipboard.writeText(text||''); showToast('Copied.'); }catch{ showToast('Copy failed.'); }
});

document.getElementById('saveBtn').addEventListener('click', ()=>{
  const text = cleanPre.textContent;
  const blob = new Blob([text || ''], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gemini-analysis-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
});

analyzeForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  resultsPre.textContent='';
  cleanPre.textContent='';
  cardsWrap.innerHTML = '';
  statusLog.textContent='';
  const prompt = (promptInput.value||'').trim();
  if(!prompt){ showToast('Please enter a prompt.'); return; }
  submitBtn.disabled = true;
  setBar(10,'Preparing…'); setStep('upload'); log('Submitting analysis…');
  try{
    const res = await fetch('/analyze-token', {
      method: 'POST',
      body: (()=>{ const fd=new FormData(); fd.append('token', token); fd.append('prompt', prompt); return fd; })()
    });
    if(!res.ok){
      const ct = res.headers.get('content-type') || '';
      let msg = `Error ${res.status}`;
      if(ct.includes('application/json')){ const j = await res.json(); if(j?.message) msg += `: ${j.message}`; } else { msg += `: ${await res.text()}`; }
      log(msg); showToast(msg); submitBtn.disabled = false; return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let softPct = 78;
    const softTimer = setInterval(()=>{ if(softPct < 92){ softPct += 1; setBar(softPct, 'Streaming…'); } }, 300);
    while(true){
      const { value, done } = await reader.read();
      if(done) break;
      const chunk = decoder.decode(value, { stream: true });
      resultsPre.textContent += chunk;
      resultsPre.scrollTop = resultsPre.scrollHeight;
      refreshViews();
      chunk.split(/\r?\n/).forEach(line=>{
        if(!line.trim()) return;
        if (/\[Error\]|\[Notice\]/.test(line) || /Uploading video|Waiting for Gemini|File is ACTIVE|Starting analysis/.test(line)) {
          log(line);
          parseServerLine(line);
        }
      });
    }
    clearInterval(softTimer);
    setBar(100,'Complete ✓'); log('Done.');
    refreshViews();
  }catch(err){
    setBar(0,'Idle'); showToast('Network error.'); log(String(err));
  }finally{
    submitBtn.disabled = false;
  }
});

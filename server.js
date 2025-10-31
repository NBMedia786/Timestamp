
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import morgan from 'morgan';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { lookup as mimeLookup } from 'mime-types';
import https from 'https';
import { spawn } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default system prompt used for analysis when user does not provide additional instructions
const DEFAULT_PROMPT = `Analyze this video and extract the following information:

METADATA EXTRACTION (Extract from any visible text, audio, or context):
- DATE: Any dates, times, or timestamps visible or mentioned
- ADDRESS/LOCATION: Street addresses, building names, landmarks, or location references
- CITY/STATE/COUNTY: Geographic location information
- POLICE DEPARTMENT: Agency names, officer badges, department identifiers, or jurisdiction

TIMESTAMP ANALYSIS (Extract timestamps for these categories):

1. 911 CALLS:
   - Emergency calls being made or received
   - Distress signals or calls for help
   - Emergency dispatcher communications
   - Critical emergency moments

2. CCTV FOOTAGE:
   - Suspicious activities or behaviors
   - People entering or leaving areas
   - Vehicle movements and activities
   - Security incidents or breaches
   - Unusual or notable events

3. INTERROGATION:
   - Questioning sessions or interviews
   - Confessions or admissions
   - Denials or evasive responses
   - Important statements or testimony
   - Emotional reactions during questioning

4. BODYCAM FOOTAGE:
   - Police officer interactions with civilians
   - Use of force incidents
   - Evidence collection moments
   - Procedural compliance or violations
   - Important statements or commands

5. INVESTIGATION:
   - Evidence discovery and collection
   - Crime scene analysis
   - Witness interviews
   - Key findings or breakthroughs
   - Case development moments

6. INTERROGATION (Additional):
   - Follow-up questioning sessions
   - Cross-examinations
   - Additional confessions or statements
   - Legal proceedings or hearings

FORMAT:
METADATA:
- Date: [extracted date/time information]
- Address/Location: [extracted location details]
- City/State/County: [extracted geographic information]
- Police Department: [extracted agency information]

TIMESTAMPS:
Format each timestamp as: [MM:SS - MM:SS] - [CATEGORY] - Description. Provide a start and end time for each event.
Additionally, in the textual label or description, include the range in parentheses after the category, e.g., 911 Call (00:45 - 01:00).

SUMMARY AND STORYLINE:
After extracting all timestamps, provide a comprehensive summary that explains:
- The overall narrative of the video
- Key events and their significance
- Timeline of important developments
- Main characters or subjects involved
- Conclusion or outcome

Be thorough in identifying moments that fit these specific categories and extract all visible metadata.`;

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY in .env');
  process.exit(1);
}

const app = express();
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes must come BEFORE static file serving to avoid conflicts
app.post('/api/share', async (req, res) => {
  try {
    console.log('Share request received. Body keys:', Object.keys(req.body || {}));
    const { analysisText, videoUrl, fileName } = req.body || {};
    
    if (!analysisText || !analysisText.trim()) {
      console.error('Share request missing analysisText');
      return res.status(400).json({ message: 'Missing analysis text' });
    }
    
    const shareId = generateShareId();
    console.log('Generated shareId:', shareId);
    
    if (!shareId || shareId.length < 5) {
      console.error('Invalid share ID generated:', shareId);
      return res.status(500).json({ message: 'Failed to generate share ID', shareId: null });
    }
    
    const shared = await readSharedAnalyses();
    
    shared[shareId] = {
      id: shareId,
      analysisText: analysisText.trim(),
      videoUrl: videoUrl || null,
      fileName: fileName || null,
      createdAt: new Date().toISOString()
    };
    
    await writeSharedAnalyses(shared);
    console.log('Saved shared analysis. ShareId:', shareId, 'Total shares:', Object.keys(shared).length);
    
    // Construct shareable URL - detect host from request
    let host = req.get('host') || req.headers.host;
    if (!host) {
      // Fallback: try to extract from origin/referer
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        try {
          const url = new URL(origin);
          host = url.host;
        } catch {}
      }
    }
    // Final fallback
    if (!host) {
      host = `localhost:${PORT}`;
    }
    
    const protocol = (req.secure || req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
    const shareUrl = `${protocol}://${host}/share/${shareId}`;
    
    // Always return shareId and constructed URL
    const response = { 
      shareId: shareId,
      url: shareUrl
    };
    
    console.log('Sending response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (e) {
    console.error('Error in /api/share:', e);
    res.status(500).json({ message: e?.message || 'Failed to create share link', error: String(e) });
  }
});

// Serve static files from project root (moved from /public)
app.use(express.static(__dirname));

// Shared files directory for linkable local video uploads
const SHARED_DIR = path.join(__dirname, 'shared');
await fsp.mkdir(SHARED_DIR, { recursive: true });
app.use('/shared', express.static(SHARED_DIR, { fallthrough: true, setHeaders: (res) => {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
} }));

// -------- Simple in-memory queue for /upload (beta: 5-10 users) --------
const CONCURRENCY_LIMIT = 5; // 4-core VPS: allow ~5 concurrent analyses safely
let activeJobs = 0;
const jobQueue = [];

function processQueue() {
  while (activeJobs < CONCURRENCY_LIMIT && jobQueue.length > 0) {
    const job = jobQueue.shift();
    activeJobs += 1;
    // Notify client job is starting
    try { job.res.write(`\n[Notice] Starting analysis...\n`); } catch {}
    Promise.resolve()
      .then(() => job.run())
      .catch((e) => { try { job.res.write(`\n[Error] ${e?.message || String(e)}\n`); } catch {} })
      .finally(() => { activeJobs -= 1; processQueue(); });
  }
}

function enqueueJob(run, res) {
  // Calculate position before processing queue
  // Position = jobs waiting in queue + currently active jobs
  const position = jobQueue.length + activeJobs + 1; // +1 for this job we're about to add
  jobQueue.push({ run, res });
  processQueue();
  return position;
}

// Simple server-side history store (JSON) with 20GB quota
const DATA_DIR = path.join(__dirname, 'data');
await fsp.mkdir(DATA_DIR, { recursive: true });
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SHARED_ANALYSES_FILE = path.join(DATA_DIR, 'shared_analyses.json');
const TOTAL_STORAGE_BYTES = 20 * 1024 * 1024 * 1024; // 20GB

async function readHistory() {
  try {
    const buf = await fsp.readFile(HISTORY_FILE);
    const arr = JSON.parse(buf.toString());
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeHistory(items) {
  await fsp.writeFile(HISTORY_FILE, JSON.stringify(items, null, 2));
}

// Shared analyses storage
async function readSharedAnalyses() {
  try {
    const buf = await fsp.readFile(SHARED_ANALYSES_FILE);
    const obj = JSON.parse(buf.toString());
    return typeof obj === 'object' && obj !== null ? obj : {};
  } catch {
    return {};
  }
}

async function writeSharedAnalyses(shared) {
  await fsp.writeFile(SHARED_ANALYSES_FILE, JSON.stringify(shared, null, 2));
}

// Generate a short, unique share ID
function generateShareId() {
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36).substring(5);
  const shareId = randomPart + timePart;
  console.log('Generated share ID:', shareId, 'length:', shareId.length);
  return shareId;
}

async function getFileSizeBytesFromShared(urlOrPath) {
  try {
    if (!urlOrPath) return 0;
    // Expecting /shared/<filename>
    let pathname = '';
    try { pathname = new URL(urlOrPath, 'http://localhost').pathname; } catch { pathname = urlOrPath; }
    if (!pathname.startsWith('/shared/')) return 0;
    const name = decodeURIComponent(pathname.replace('/shared/', ''));
    const filePath = path.join(SHARED_DIR, name);
    const st = await fsp.stat(filePath);
    return st.size || 0;
  } catch { return 0; }
}

function textSizeBytes(text) {
  try { return Buffer.byteLength(text || '', 'utf8'); } catch { return 0; }
}

async function computeUsedBytes(items) {
  let used = 0;
  for (const it of (items || [])) {
    used += textSizeBytes(it.analysisText);
    if (it.videoUrl) used += await getFileSizeBytesFromShared(it.videoUrl);
  }
  return used;
}

// Keep-alive agent for outgoing HTTPS
import http from 'http';
const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

// Temp upload dir
const uploadDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'uploads-'));
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, `${ts}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
}).single('video');

// Separate multer for sharing local videos into shared directory
const shareStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SHARED_DIR),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${ts}-${rand}${ext}`);
  }
});
const shareUpload = multer({ storage: shareStorage, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }).single('file');

// ---------- helpers ----------

const isYouTubeUrl = (url) => {
  try {
    const u = new URL(url);
    return /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === 'youtu.be';
  } catch {
    return false;
  }
};
const deleteIfExists = async (p) => { if (p) { try { await fsp.unlink(p); } catch {} } };
function getMimeType(filePath) { return mimeLookup(path.extname(filePath)) || 'application/octet-stream'; }

// ffmpeg detection
async function hasFfmpeg() {
  const candidates = [
    'ffmpeg', 'ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe'
  ];
  for (const cmd of candidates) {
    try {
      await new Promise((resolve, reject) => {
        const proc = spawn(cmd, ['-version']);
        proc.on('error', reject);
        proc.on('close', code => (code === 0 ? resolve() : reject()));
      });
      return { ok: true, path: cmd };
    } catch {}
  }
  return { ok: false };
}

// ---- yt-dlp presence (self-download if missing) ----
const YTDLP_BIN_DIR = path.join(os.tmpdir(), 'yt-dlp-bin');
await fsp.mkdir(YTDLP_BIN_DIR, { recursive: true });
const YTDLP_BIN_NAME = process.platform === 'win32' ? 'yt-dlp.exe' : (process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp');
const YTDLP_BIN_PATH = path.join(YTDLP_BIN_DIR, YTDLP_BIN_NAME);

const YTDLP_RELEASE_URLS = {
  win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
  linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
};

function downloadToFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (resp) => {
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        return downloadToFile(resp.headers.location, destPath).then(resolve).catch(reject);
      }
      if (resp.statusCode !== 200) {
        file.close(() => fs.unlink(destPath, () => {}));
        return reject(new Error(`Failed to download yt-dlp (HTTP ${resp.statusCode})`));
      }
      resp.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close(() => fs.unlink(destPath, () => {}));
      reject(err);
    });
  });
}

async function which(cmd) {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, cmd + e);
      try { await fsp.access(p, fs.constants.X_OK); return p; } catch {}
    }
  }
  return null;
}

async function ensureYtDlp() {
  // PATH first
  let bin = await which(process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (bin) return bin;

  // Local cached binary
  if (!fs.existsSync(YTDLP_BIN_PATH)) {
    const url = YTDLP_RELEASE_URLS[process.platform] || YTDLP_RELEASE_URLS.linux;
    await downloadToFile(url, YTDLP_BIN_PATH);
    if (process.platform !== 'win32') {
      await fsp.chmod(YTDLP_BIN_PATH, 0o755);
    }
  }
  return YTDLP_BIN_PATH;
}

function spawnPromise(bin, args, { collectStderr = true } = {}) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', collectStderr ? 'pipe' : 'inherit'], windowsHide: true, shell: false });
    if (collectStderr && proc.stderr) {
      proc.stderr.on('data', d => { stderr += d.toString(); });
    }
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve({ code, stderr }) : reject(new Error(`${bin} exited with code ${code}${stderr ? `\n${stderr}` : ''}`)));
  });
}

// Prefer progressive MP4; fallback to separate streams merge (needs ffmpeg)
function ytFormatArgs(ffmpegOk) {
  const args = [
    '--no-playlist',
    '--no-check-certificate',
    '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best',
    '-S', 'ext:mp4:m4a,res,codec:avc1:acodec:aac'
  ];
  if (ffmpegOk) {
    args.push('--merge-output-format', 'mp4');
  } else {
    args[3] = 'b[ext=mp4]/best'; // progressive only if possible
  }
  return args;
}

// Robust YouTube download (returns created file path, whatever ext)
async function downloadYouTube(url) {
  const bin = await ensureYtDlp();
  const ff = await hasFfmpeg();

  const outBase = path.join(os.tmpdir(), `yt-${Date.now()}`);
  const outTpl = `${outBase}.%(ext)s`;
  const args = [ url, ...ytFormatArgs(ff.ok), '-o', outTpl ];

  // Retry around EBUSY or transient spawn issues (common on Windows with AV scanners)
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      await spawnPromise(bin, args);
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e).toLowerCase();
      const isBusy = (e?.code === 'EBUSY') || msg.includes('ebusy') || msg.includes('busy');
      if (attempt < 4 && isBusy) {
        // random small backoff (400-900ms)
        const delay = 300 + Math.floor(Math.random() * 700);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw e;
    }
  }

  const created = (await fsp.readdir(path.dirname(outBase)))
    .map(name => path.join(path.dirname(outBase), name))
    .filter(p => p.startsWith(outBase + '.'));
  if (!created.length) throw new Error('yt-dlp finished but no output file was found.');

  return created[0]; // could be .mp4/.webm etc.
}

// ---------- Gemini ----------

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY, { agent: keepAliveAgent });
const fileManager = new GoogleAIFileManager(GEMINI_API_KEY, { agent: keepAliveAgent });
const MODEL = 'gemini-2.5-pro';

async function waitForActive(fileName, { timeoutMs = 10 * 60 * 1000, intervalMs = 3000 } = {}) {
  const start = Date.now();
  while (true) {
    const f = await fileManager.getFile(fileName);
    const state = f?.file?.state || f?.state;
    if (state === 'ACTIVE') return f;
    if (state === 'FAILED' || state === 'DELETED') throw new Error(`Gemini file state is ${state}; cannot proceed.`);
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for Gemini file to become ACTIVE (last state=${state ?? 'unknown'})`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

function isTransientError(err) {
  const msg = (err?.message || '').toLowerCase();
  const code = err?.status || err?.code || '';
  return (
    /503|500|502|504/.test(String(code)) ||
    msg.includes('503') || msg.includes('500') || msg.includes('502') || msg.includes('504') ||
    msg.includes('timed out') || msg.includes('timeout') ||
    msg.includes('ecconnreset') || msg.includes('etimedout') || msg.includes('econnrefused')
  );
}

async function streamWithRetry(model, request, { attempts = 3, initialDelayMs = 2000, onRetry = () => {} } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const resp = await model.generateContentStream(request);
      return resp;
    } catch (err) {
      lastErr = err;
      if (i < attempts && isTransientError(err)) {
        const delay = initialDelayMs * Math.pow(2, i - 1);
        await onRetry(i + 1, delay, err);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ---------- endpoint ----------

app.post('/upload', (req, res) => {
  // Set streaming headers IMMEDIATELY - this allows client to start receiving response
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  
  upload(req, res, async (err) => {
    if (err) {
      const message = err.message || 'File upload error';
      return res.status(400).send(message);
    }

    const { url, prompt } = req.body || {};
    const hasFile = !!req.file;
    const hasUrl = !!url;

    // Prompt is now optional; we'll combine it with DEFAULT_PROMPT below
    if (hasFile && hasUrl) {
      return res.status(400).send('Provide either a video file OR a YouTube URL, not both.');
    }
    if (!hasFile && !hasUrl) {
      return res.status(400).send('Upload a video or provide a YouTube URL.');
    }
    if (hasUrl && !isYouTubeUrl(url)) {
      return res.status(400).send('URL must be a valid YouTube link.');
    }

    // Send immediate acknowledgment - this ensures client gets response right away
    // For YouTube URLs, send a specific message; for local files, send generic message
    try {
      const message = hasUrl ? '[Notice] YouTube URL received. Processing...\n' : '[Notice] Request received. Processing...\n';
      res.write(message);
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }
    } catch (flushError) {
      console.warn('Could not flush initial response:', flushError);
    }

    let localPath = null;
    let cleanupPath = null;
    let uploaded = null;

    // Enqueue job to respect concurrency limit
    const position = enqueueJob(async () => {
      try {
        // 1) Resolve local video path
        if (hasFile) {
          localPath = req.file.path;
          cleanupPath = localPath;
        } else {
          res.write('Downloading YouTube video…\n');
          try {
            localPath = await downloadYouTube(url);
          } catch (e) {
            const msg = e?.message || String(e);
            if (/ffmpeg/i.test(msg)) {
              throw new Error('YouTube download needs ffmpeg for merging. Install it (e.g., winget install FFmpeg.FFmpeg -e) and try again.\n' + msg);
            }
            if (/HTTP Error 410|unavailable|age|signin|restricted/i.test(msg)) {
              throw new Error('This YouTube video cannot be downloaded (age-restricted, private, or region-locked). Try a different public video.\n' + msg);
            }
            if (/\bebusy\b/i.test(msg)) {
              throw new Error('YouTube download failed due to a temporary file lock (EBUSY). Please try again in a moment, or exclude your temp folder from real-time antivirus scanning.\n' + msg);
            }
            throw new Error('YouTube download failed:\n' + msg);
          }
          cleanupPath = localPath;
          res.write('Download complete.\n');
        }

        // 2) Upload to Gemini
        const mimeType = getMimeType(localPath);
        res.write('Uploading video to Gemini File API…\n');

        uploaded = await fileManager.uploadFile(localPath, {
          mimeType,
          displayName: path.basename(localPath),
        });

        if (!uploaded?.file?.name) throw new Error('Failed to upload file to Gemini.');

        // 3) Wait ACTIVE
        res.write('Upload complete. Waiting for Gemini to process the file…\n');
        const ready = await waitForActive(uploaded.file.name);
        const fileUri = ready.file?.uri || uploaded.file?.uri;
        if (!fileUri) throw new Error('Gemini did not return a file URI.');

        res.write('File is ACTIVE. Starting analysis with Gemini 2.5 Pro…\n\n');

        // 4) Stream generation with retries
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' }, { timeout: 5 * 60 * 1000 });

        // Build final prompt (DEFAULT + optional user instruction)
        const userQuery = (prompt || '').trim();
        let finalPrompt = DEFAULT_PROMPT;
        if (userQuery) {
          finalPrompt += `\n\nADDITIONAL USER INSTRUCTION:\n${userQuery}`;
        }
        const requestPayload = {
          contents: [{
            parts: [
              { text: finalPrompt },
              { fileData: { mimeType, fileUri } }
            ]
          }]
        };

        const streamResp = await streamWithRetry(model, requestPayload, {
          attempts: 3,
          initialDelayMs: 2000,
          onRetry: async (nextAttempt, delayMs, e) => {
            res.write(`\n[Notice] Transient error (${e?.status || e?.code || 'unknown'}). Retrying attempt ${nextAttempt} in ${Math.round(delayMs/1000)}s…\n`);
          }
        });

        for await (const chunk of streamResp.stream) {
          const text = chunk?.text?.() || '';
          if (text) res.write(text);
        }
        res.write('\n');
      } catch (e) {
        const msg = e?.message || String(e);
        if (!res.headersSent) return res.status(500).send(msg);
        else res.write(`\n[Error] ${msg}\n`);
      } finally {
        await deleteIfExists(cleanupPath);
        try { if (uploaded?.file?.name) await fileManager.deleteFile(uploaded.file.name); } catch {}
        if (!res.writableEnded) res.end();
      }
    }, res);
    try { res.write(`[Notice] Queued. Position: ${position}\n`); } catch {}
  });
});

// Share endpoint: accepts a local video file and returns a public URL under /shared
app.post('/share/upload', (req, res) => {
  shareUpload(req, res, (err) => {
    if (err) {
      const message = err?.message || 'Share upload failed';
      return res.status(400).json({ message });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Missing file' });
    }
    // Construct absolute URL for better VPS compatibility
    let host = req.get('host') || req.headers.host;
    if (!host) {
      const origin = req.headers.origin || req.headers.referer;
      if (origin) {
        try {
          const url = new URL(origin);
          host = url.host;
        } catch {}
      }
    }
    if (!host) {
      host = `localhost:${PORT}`;
    }
    const protocol = (req.secure || req.headers['x-forwarded-proto'] === 'https') ? 'https' : 'http';
    const publicUrl = `${protocol}://${host}/shared/${encodeURIComponent(req.file.filename)}`;
    return res.json({ url: publicUrl });
  });
});


// Get shared analysis by ID
app.get('/api/share/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const shared = await readSharedAnalyses();
    const analysis = shared[id];
    
    if (!analysis) {
      return res.status(404).json({ message: 'Shared analysis not found' });
    }
    
    res.json(analysis);
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Failed to load shared analysis' });
  }
});

// Route for shared analysis page - MUST be before catch-all route
app.get('/share/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Serving share page for ID:', id);
    const shared = await readSharedAnalyses();
    const analysis = shared[id];
    
    if (!analysis) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Analysis Not Found</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>Analysis Not Found</h1>
          <p>This shared analysis link is invalid or has expired.</p>
          <a href="/">← Back to Home</a>
        </body>
        </html>
      `);
    }
    
    // Serve the view.html page
    const viewPath = path.join(__dirname, 'view.html');
    res.sendFile(viewPath);
  } catch (e) {
    console.error('Error serving share page:', e);
    res.status(500).send('Error loading shared analysis');
  }
});

// ---------- History API ----------
app.get('/api/history', async (req, res) => {
  const items = await readHistory();
  // newest first by id (timestamp string)
  items.sort((a, b) => (parseInt(b.id) || 0) - (parseInt(a.id) || 0));
  res.json(items);
});

app.get('/api/history/storage', async (req, res) => {
  const items = await readHistory();
  const used = await computeUsedBytes(items);
  res.json({ used, total: TOTAL_STORAGE_BYTES });
});

app.post('/api/history', async (req, res) => {
  try {
    const { name, analysisText, videoUrl, fileName } = req.body || {};
    if (!analysisText || !name) return res.status(400).json({ message: 'Missing name or analysisText' });
    const items = await readHistory();
    const timestamp = Date.now();
    const newItem = { 
      id: timestamp.toString(), 
      name, 
      analysisText, 
      videoUrl: videoUrl || null, 
      fileName,
      createdAt: timestamp,
      date: new Date(timestamp).toISOString()
    };
    const used = await computeUsedBytes(items);
    const addBytes = textSizeBytes(analysisText) + (await getFileSizeBytesFromShared(videoUrl));
    if (used + addBytes > TOTAL_STORAGE_BYTES) {
      return res.status(413).json({ message: 'Storage limit reached (20GB). Please delete some history.', used, total: TOTAL_STORAGE_BYTES });
    }
    items.unshift(newItem);
    await writeHistory(items);
    res.status(201).json(newItem);
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Failed to save history' });
  }
});

app.put('/api/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body || {};
    const items = await readHistory();
    const it = items.find(x => x.id === id);
    if (!it) return res.status(404).json({ message: 'Not found' });
    if (name && name.trim()) it.name = name.trim();
    await writeHistory(items);
    res.json(it);
  } catch (e) { res.status(500).json({ message: e?.message || 'Failed to update' }); }
});

app.delete('/api/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let items = await readHistory();
    const item = items.find(x => x.id === id);
    if (!item) return res.status(404).json({ message: 'Not found' });
    
    // Collect video URLs that need to be deleted
    const videoUrlsToDelete = new Set();
    if (item.videoUrl && typeof item.videoUrl === 'string') {
      videoUrlsToDelete.add(item.videoUrl);
    }
    
    // Delete associated shared analyses
    try {
      const shared = await readSharedAnalyses();
      const shareIdsToDelete = [];
      
      // Find all shared analyses that match this history item
      for (const [shareId, sharedItem] of Object.entries(shared)) {
        // Match by analysisText (most reliable) or videoUrl
        const textMatches = sharedItem.analysisText && item.analysisText && 
                           sharedItem.analysisText.trim() === item.analysisText.trim();
        const videoMatches = sharedItem.videoUrl && item.videoUrl && 
                            sharedItem.videoUrl === item.videoUrl;
        
        if (textMatches || videoMatches) {
          shareIdsToDelete.push(shareId);
          // Track video URLs from shared analyses that will be deleted
          if (sharedItem.videoUrl) {
            videoUrlsToDelete.add(sharedItem.videoUrl);
          }
        }
      }
      
      // Delete shared analyses
      for (const shareId of shareIdsToDelete) {
        delete shared[shareId];
        console.log('Deleted shared analysis:', shareId);
      }
      
      if (shareIdsToDelete.length > 0) {
        await writeSharedAnalyses(shared);
        console.log(`Deleted ${shareIdsToDelete.length} shared analysis/analyses`);
      }
    } catch (err) {
      console.error('Error deleting shared analyses:', err);
      // Continue with deletion even if shared analysis deletion fails
    }
    
    // Delete all video files
    for (const videoUrl of videoUrlsToDelete) {
      try {
        // Extract filename from URL (could be /shared/filename or full URL)
        let pathname = '';
        try {
          const url = new URL(videoUrl);
          pathname = url.pathname;
        } catch {
          // If it's not a full URL, treat it as a path
          pathname = videoUrl;
        }
        
        if (pathname.startsWith('/shared/')) {
          const filename = decodeURIComponent(pathname.replace('/shared/', ''));
          const filePath = path.join(SHARED_DIR, filename);
          await deleteIfExists(filePath);
          console.log('Deleted video file:', filePath);
        }
      } catch (err) {
        console.error('Error deleting video file:', err);
        // Continue with deletion even if file deletion fails
      }
    }
    
    // Remove item from history
    items = items.filter(x => x.id !== id);
    await writeHistory(items);
    res.json({ ok: true });
  } catch (e) { 
    console.error('Delete error:', e);
    res.status(500).json({ message: e?.message || 'Failed to delete' }); 
  }
});

// Root
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on http://0.0.0.0:${PORT} (accessible from all network interfaces)`);
  console.log(`   Local access: http://localhost:${PORT}`);
});
server.headersTimeout = 0;
server.requestTimeout = 0;

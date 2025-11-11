
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
import http from 'http';
import { spawn } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { randomBytes } from 'crypto';
import Database from 'better-sqlite3';
import helmet from 'helmet';
import ConnectSqlite3 from 'connect-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default system prompt used for analysis when user does not provide additional instructions
const DEFAULT_PROMPT = `Analyze this video and extract the following information:

METADATA EXTRACTION (Extract from any visible text, audio, or context):

- DATE: Any dates, times, or timestamps visible or mentioned

- ADDRESS/LOCATION: Street addresses, building names, landmarks, or location references

- CITY/STATE/COUNTY: Geographic location information.

- POLICE DEPARTMENT: Agency names, officer badges, department identifiers, or jurisdiction



TIMESTAMP ANALYSIS:

Your task is to find events and assign them to one of the 7 categories below.

**CRITICAL TIMESTAMP ACCURACY REQUIREMENTS:**

- You MUST watch the video carefully and identify the EXACT start and end times for each event.
- Timestamps MUST be precise to the SECOND (MM:SS format).
- Use the video's actual playback timeline - start from 00:00 at the beginning of the video.
- Each timestamp should capture a DISTINCT, SEPARATE event or action.
- Do NOT create overlapping timestamps for the same event.
- Do NOT round times arbitrarily - use the actual moment when events begin and end.
- If events are very brief (under 5 seconds), still capture the exact start and end times.
- PREFER SHORTER, MORE SPECIFIC timestamps over longer, general ones.
- If a conversation or action lasts 30+ seconds, consider breaking it into smaller segments (e.g., [00:00 - 00:15] for the first part, [00:15 - 00:30] for the next part).
- Watch the entire video frame-by-frame if necessary to ensure accuracy.
- Pay attention to natural breaks in conversation, actions, or scene changes to determine precise boundaries.

CATEGORY RULES (CRITICAL!):

- A single event or timestamp (e.g., "[00:00 - 00:05]") **MUST** be listed in only **ONE** category.

- **DO NOT** list the same event in multiple categories.

- You **MUST** follow a strict priority: **Source Categories ALWAYS override Event Categories.**



- **Priority 1: Source Categories** (If you know the *source* of the clip, use this category):

  - 911 CALLS (Audio source)

  - CCTV FOOTAGE (Fixed camera source)

  - BODYCAM FOOTAGE (Officer-worn camera source)

  - DASHCAM FOOTAGE (Vehicle camera source)



- **Priority 2: Event Categories** (Only use these if the source is unknown or not applicable, e.g., a formal sit-down interview):

  - INTERROGATION

  - INTERVIEW

  - INVESTIGATION



- **THE GOLDEN RULE:**

- If an "Interview" or an "Investigation" is clearly recorded on **BODYCAM FOOTAGE**, you **MUST** list it **ONLY** under the **BODYCAM FOOTAGE** category.

- If an "Investigation" is recorded on **CCTV FOOTAGE**, you **MUST** list it **ONLY** under the **CCTV FOOTAGE** category.

- If an "Interrogation" is recorded on a **DASHCAM**, you **MUST** list it **ONLY** under the **DASHCAM FOOTAGE** category.

- **This is not optional.** You must choose only one category, and the Source (Bodycam, CCTV, etc.) always wins.



FORMAT:

METADATA:

- Date: [extracted date/time information]

- Address/Location: [extracted location details]

- City/State/County: [extracted geographic information]

- Police Department: [extracted agency information]



TIMESTAMPS:

For each category, you MUST provide a heading with the count of timestamps in that category.



The format MUST be exactly: [Number]. [CATEGORY NAME] ([Count])



Examples:

1. 911 CALLS (1)

2. CCTV FOOTAGE (8)     <-- An investigation seen on CCTV goes here

3. INTERROGATION (0)  <-- An interrogation on a dashcam means this stays (0)

4. INTERVIEW (0)      <-- An interview on a bodycam means this stays (0)

5. BODYCAM FOOTAGE (5)  <-- All events captured by bodycams go here

6. DASHCAM FOOTAGE (2)  <-- All events captured by dashcams go here

7. INVESTIGATION (0)  <-- An investigation on CCTV means this stays (0)



The count in parentheses is REQUIRED and must match the actual number of timestamps you provide for that category.



Format each timestamp entry as: [MM:SS - MM:SS] - [Short Label] - [Full Description]

**TIMESTAMP FORMATTING RULES:**
- Always use [MM:SS - MM:SS] format (two digits for minutes, two digits for seconds).
- The start time is when the event FIRST begins (first word spoken, first action taken, etc.).
- The end time is when the event COMPLETELY ends (last word spoken, action completed, scene changes, etc.).
- Be precise: [00:05 - 00:12] means the event starts at 5 seconds and ends at 12 seconds.
- If timestamps appear in the video itself, use those exact timestamps.
- If no timestamps appear in the video, count from the beginning (00:00 is the start of the video).

Example (for an interview on a bodycam):

[00:03 - 00:18] - Field Interview - The officer conducts a field interview with a civilian about a complaint. The interview begins when the officer first addresses the subject and ends when the conversation concludes.

(This timestamp would go under the "BODYCAM FOOTAGE" category, and "INTERVIEW" would be (0)).



Example (for an investigation on CCTV):

[01:30 - 02:15] - Evidence Collection - A detective is seen collecting evidence from the sidewalk. The action begins when the detective first approaches the evidence and ends when they finish collecting it.

(This timestamp would go under the "CCTV FOOTAGE" category, and "INVESTIGATION" would be (0)).



**IMPORTANT:** Double-check your timestamps by mentally replaying the video timeline. Each timestamp should accurately reflect when that specific event occurred in the video.



IMPORTANT REQUIREMENT FOR ALL CATEGORIES:

You MUST output ALL 7 of the category headings, even if no timestamps are found.

For any category with a count of (0), you MUST explicitly output: "No [CATEGORY NAME] timestamps were found in this video."



SUMMARY AND STORYLINE:

After extracting all timestamps, provide a comprehensive summary that explains:

- The overall narrative of the video

- Key events and their significance

- Timeline of important developments

- Main characters or subjects involved

- Conclusion or outcome

`;

const PORT = process.env.PORT || 3001
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GEMINI_API_KEY in .env');
  process.exit(1);
}

// Initialize DATA_DIR early (before session middleware)
const DATA_DIR = path.join(__dirname, 'data');
await fsp.mkdir(DATA_DIR, { recursive: true });

// Initialize SQLite session store (needed for session middleware)
const SQLiteStore = ConnectSqlite3(session);

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // 1. Allow scripts from cloudflare
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      frameSrc: ["'self'", "https://www.youtube.com"],
      // 2. Allow 'blob:' URLs for the video player
      mediaSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SESSION & PASSPORT (with Persistent SQLite Store) ---
app.use(session({
  store: new SQLiteStore({
    db: 'app.db', // Use your existing database file
    dir: DATA_DIR, // Specify the directory where the DB is located
    table: 'sessions', // The table to store sessions in
    concurrentDB: true // Use the same DB connection as the app
  }),
  secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'), // Use a persistent secret from .env
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use true for HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7-day session
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// --- PASSPORT CONFIG ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.APP_BASE_URL}/auth/google/callback`,
    passReqToCallback: true
  },
  (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;

      // --- NEW SECURITY CHECK ---
      // Get admin emails from .env
      const adminEmailList = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => e.length > 0);

      const emailLower = email.toLowerCase();
      const isDomainUser = emailLower.endsWith('@nbmediaproductions.com');
      const isSuperAdmin = adminEmailList.includes(emailLower);

      // **YOUR NEW CUSTOM SECURITY CHECK**
      // User must be EITHER a domain user OR a super admin to log in
      if (!isDomainUser && !isSuperAdmin) {
        return done(null, false, { message: 'This account is not authorized.' });
      }
      // --- END NEW SECURITY CHECK ---

      const { id: google_id, displayName: display_name } = profile;

      // Use a transaction for safety
      const transaction = db.transaction(() => {
        // Find or create the user
        let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);

        if (user) {
          // User exists, update their name just in case
          db.prepare('UPDATE users SET display_name = ?, email = ? WHERE google_id = ?')
            .run(display_name, email, google_id);
        } else {
          // New user, create them
          db.prepare('INSERT INTO users (google_id, email, display_name) VALUES (?, ?, ?)')
            .run(google_id, email, display_name);
        }

        // **Log this login event for the dashboard**
        db.prepare('INSERT INTO login_logs (user_google_id) VALUES (?)').run(google_id);

        // Get the final user data to pass to the session
        return db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);
      });

      // Execute transaction and get user
      const user = transaction();
      done(null, user);

    } catch (err) {
      return done(err, null);
    }
  }
));

// Tell passport how to "remember" a user (store only the ID)
passport.serializeUser((user, done) => {
  done(null, user.google_id);
});

// Tell passport how to "find" a user from the session ID
passport.deserializeUser((google_id, done) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(google_id);
    done(null, user || false);
  } catch (err) {
    done(err, null);
  }
});

// --- GATEKEEPER MIDDLEWARE ---
const checkAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
};

// --- ADMIN GATEKEEPER ---
const checkAdmin = (req, res, next) => {
  // Get admin emails from .env
  const adminEmailList = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  const userEmail = req.user?.email?.toLowerCase();

  // User is allowed if they are logged in AND their email is in the admin list
  if (req.isAuthenticated() && userEmail && adminEmailList.includes(userEmail)) {
    return next();
  }
  
  // Not an admin, send them to the main app
  res.redirect('/');
};

// --- ADMIN SECRET CHECK (for API endpoints) ---
const checkAdminSecret = (req, res, next) => {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers['x-admin-secret'] || req.query.secret;

  // If ADMIN_SECRET is set, require it for API access
  if (adminSecret) {
    if (!providedSecret || providedSecret !== adminSecret) {
      return res.status(403).json({ 
        error: 'Unauthorized',
        message: 'Admin secret required' 
      });
    }
  }

  // Also check authentication (for dashboard access)
  if (!req.isAuthenticated()) {
    return res.status(401).json({ 
      error: 'Unauthenticated',
      message: 'Authentication required' 
    });
  }

  // Check admin email list
  const adminEmailList = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  const userEmail = req.user?.email?.toLowerCase();

  if (!userEmail || !adminEmailList.includes(userEmail)) {
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Admin access required' 
    });
  }

  next();
};

// --- AUTH ROUTES ---
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', 
  passport.authenticate('google', {
    failureRedirect: '/login?error=' + encodeURIComponent('Authentication failed. Only @nbmediaproductions.com users are allowed.'),
    failureMessage: true
  }),
  (req, res) => {
    res.redirect('/');
  }
);

app.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) { return next(err); }
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/admin', checkAuth, checkAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- END AUTH ROUTES ---

// API routes must come BEFORE static file serving to avoid conflicts
app.post('/api/share', checkAuth, async (req, res) => {
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
app.use(express.static(__dirname, { index: false }));

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

function notifyQueuePositions() {
  // Notify all queued jobs about their current position
  jobQueue.forEach((job, index) => {
    const currentPosition = index + activeJobs + 1; // +1 because positions are 1-based
    try {
      job.res.write(`[Notice] Queue position updated: ${currentPosition}\n`);
    } catch {}
  });
}

function processQueue() {
  while (activeJobs < CONCURRENCY_LIMIT && jobQueue.length > 0) {
    const job = jobQueue.shift();
    activeJobs += 1;
    // Notify client job is starting
    try { job.res.write(`\n[Notice] Starting analysis...\n`); } catch {}
    Promise.resolve()
      .then(() => job.run())
      .catch((e) => { try { job.res.write(`\n[Error] ${e?.message || String(e)}\n`); } catch {} })
      .finally(() => { 
        activeJobs -= 1; 
        processQueue();
        // Notify remaining queued jobs about position changes
        notifyQueuePositions();
      });
  }
}

function enqueueJob(run, res) {
  // Calculate position before processing queue
  // Position = jobs waiting in queue + currently active jobs
  const position = jobQueue.length + activeJobs + 1; // +1 for this job we're about to add
  jobQueue.push({ run, res });
  processQueue();
  // Notify all queued jobs (including this one) about their positions
  notifyQueuePositions();
  return position;
}

// Simple server-side history store (JSON) with 20GB quota
// DATA_DIR is already defined above (before session middleware)

// --- DATABASE INITIALIZATION ---
console.log('Opening database connection...');
const DB_PATH = path.join(DATA_DIR, 'app.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency (important!)
db.pragma('journal_mode = WAL');

// Create tables IF THEY DON'T EXIST (safe to run every time)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    google_id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS login_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_google_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_google_id) REFERENCES users (google_id)
  );

  CREATE TABLE IF NOT EXISTS analysis_jobs (
    job_id TEXT PRIMARY KEY,
    user_google_id TEXT,
    analyzed_by_name TEXT,
    job_name TEXT,
    analysis_text TEXT,
    video_url TEXT,
    file_name TEXT,
    created_at DATETIME,
    status TEXT NOT NULL DEFAULT 'completed',
    time_taken_ms INTEGER,
    error_message TEXT,
    FOREIGN KEY (user_google_id) REFERENCES users (google_id)
  );
`);

console.log('Database connection open and tables verified.');
// --- END DATABASE INITIALIZATION ---

const TOTAL_STORAGE_BYTES = 20 * 1024 * 1024 * 1024; // 20GB

// Shared analyses storage (still needed for share functionality)
const SHARED_ANALYSES_FILE = path.join(DATA_DIR, 'shared_analyses.json');

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

function textSizeBytes(text) {
  try { return Buffer.byteLength(text || '', 'utf8'); } catch { return 0; }
}

function extractTitle(analysisText, promptText, fileName, url) {
  // --- Priority 1: Filename (for file uploads) ---
  if (fileName) {
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    if (nameWithoutExt && nameWithoutExt.length > 0) {
      // Return the full original name without truncating
      return nameWithoutExt;
    }
  }

  // --- Priority 2: YouTube URL (This was the missing piece) ---
  if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
    // Try to get the video ID as a simple name
    const videoIdMatch = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
    if (videoIdMatch && videoIdMatch[1]) {
      // Use a simple, clean name like "YouTube (abc123xyz)"
      return `YouTube Video (${videoIdMatch[1].substring(0, 11)})`;
    }
    return `YouTube Video Analysis`;
  }

  // --- Priority 3: Custom Prompt ---
  if (promptText && promptText.trim()) {
    const defaultPromptKeywords = ['analyze this video', 'extract the following', 'metadata extraction', 'timestamp analysis'];
    const isDefaultPrompt = defaultPromptKeywords.some(keyword => promptText.toLowerCase().includes(keyword));
    if (!isDefaultPrompt) {
      const lines = promptText.split(/\n/).filter(l => l.trim());
      if (lines.length > 0) {
        const title = lines[0].trim();
        if (title.length > 0 && title.length < 100) {
          return title.length > 60 ? title.substring(0, 57) + '...' : title;
        }
      }
    }
  }

  // --- Priority 4 (Fallback): Summary Text ---
  if (analysisText) {
    const summaryMatch = analysisText.match(/(?:SUMMARY|STORYLINE)[\s\*:]*\n+(.+?)(?:\n\n|\nTIMESTEMPS|$)/is);
    if (summaryMatch && summaryMatch[1]) {
      const summary = summaryMatch[1].trim();
      const firstLine = summary.split('\n')[0].trim();
      if (firstLine && firstLine.length > 10) {
        return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
      }
    }
  }

  // --- Final Fallback ---
  return `Video Analysis ${new Date().toLocaleDateString()}`;
}

// Keep-alive agent for outgoing HTTPS with improved timeout settings
const keepAliveAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: 50,
  keepAliveMsecs: 1000,
  timeout: 60000, // 60 second timeout
  freeSocketTimeout: 4000
});

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
  const args = [ url, ...ytFormatArgs(ff.ok), '-o', outTpl, '-4' ];

  // --- START COOKIE SUPPORT ---
  const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(COOKIES_PATH)) {
    console.log('Using cookies.txt for YouTube download...');
    args.push('--cookies', COOKIES_PATH);
  }
  // --- END COOKIE SUPPORT ---

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

async function uploadFileWithRetry(fileManager, localPath, options, { attempts = 3, initialDelayMs = 3000, onRetry = () => {} } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const uploaded = await fileManager.uploadFile(localPath, options);
      return uploaded;
    } catch (err) {
      lastErr = err;
      const msg = (err?.message || '').toLowerCase();
      const isNetworkError = msg.includes('fetch failed') || 
                            msg.includes('econnreset') || 
                            msg.includes('etimedout') || 
                            msg.includes('econnrefused') ||
                            msg.includes('network') ||
                            msg.includes('connection');
      
      if (i < attempts && (isTransientError(err) || isNetworkError)) {
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

app.post('/upload', checkAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).send(err.message || 'File upload error');
    }

    const { url, prompt } = req.body || {};
    const hasFile = !!req.file;
    const hasUrl = !!url;

    if (hasFile && hasUrl) return res.status(400).send('Provide either a video file OR a YouTube URL, not both.');
    if (!hasFile && !hasUrl) return res.status(400).send('Upload a video or provide a YouTube URL.');
    if (hasUrl && !isYouTubeUrl(url)) return res.status(400).send('URL must be a valid YouTube link.');

    const message = hasUrl ? '[Notice] YouTube URL received. Processing...\n' : '[Notice] Request received. Processing...\n';
    res.write(message);

    // --- NEW JOB TRACKING ---
    const startTime = Date.now();
    const jobId = `${Date.now()}-${req.user.google_id.slice(0, 5)}`;
    const userGoogleId = req.user.google_id;
    // --- Get user's first name ---
    let analyzedByName = 'User';
    if (req.user.displayName) {
      analyzedByName = req.user.displayName.split(' ')[0]; // "Arpit Sharma" -> "Arpit"
    } else if (req.user.email) {
      analyzedByName = req.user.email.split('@')[0]; // "arpit@..." -> "arpit"
    }
    // --- End ---
    const jobName = hasFile ? req.file.originalname : (url.split('v=')[1]?.split('&')[0] || 'YouTube Video');

    let localPath = null;
    let cleanupPath = null;
    let uploaded = null;
    let analysisTextContent = ''; // Variable to capture stream output

    // Enqueue job to respect concurrency limit
    const position = enqueueJob(async () => {
      try {
        // 1. Create initial 'processing' record
        db.prepare(`
          INSERT INTO analysis_jobs (job_id, user_google_id, analyzed_by_name, job_name, status, created_at, file_name)
          VALUES (?, ?, ?, ?, 'processing', ?, ?)
        `).run(jobId, userGoogleId, analyzedByName, jobName, new Date().toISOString(), (hasFile ? req.file.filename : null));

        // 2. Resolve local video path
        if (hasFile) {
          localPath = req.file.path;
          cleanupPath = localPath;
          // ETA Logic
          try {
            const fileSize = req.file.size;
            const etaSeconds = 90 + Math.floor(fileSize / (1024 * 1024) * 2.0); // Slow path
            res.write(`\n[Notice] ETA: ${etaSeconds}\n`);
          } catch (e) { console.warn('Could not calculate ETA for local file'); }
        } else {
          res.write('[Notice] Downloading YouTube video…\n');
          localPath = await downloadYouTube(url);
          cleanupPath = localPath;
          // ETA Logic
          try {
            const stats = await fsp.stat(localPath);
            const fileSize = stats.size;
            const etaSeconds = 90 + Math.floor(fileSize / (1024 * 1024) * 0.2); // Fast path
            res.write(`\n[Notice] ETA: ${etaSeconds}\n`);
          } catch (e) { console.warn('Could not calculate ETA for YouTube file'); }
          res.write('[Notice] Download complete.\n');
        }

        // 3. Upload to Gemini
        const mimeType = getMimeType(localPath);
        res.write('[Notice] Uploading video to Gemini File API…\n');
        uploaded = await uploadFileWithRetry(fileManager, localPath, { mimeType, displayName: path.basename(localPath) }, {
          onRetry: async (nextAttempt, delayMs, e) => {
            res.write(`\n[Notice] Upload error (${e.message.includes('fetch failed') ? 'network issue' : e.message}). Retrying attempt ${nextAttempt} in ${Math.round(delayMs/1000)}s…\n`);
          }
        });

        if (!uploaded?.file?.name) throw new Error('Failed to upload file to Gemini.');

        // 4. Wait ACTIVE
        res.write('[Notice] Upload complete. Waiting for Gemini to process the file…\n');
        const ready = await waitForActive(uploaded.file.name);
        const fileUri = ready.file?.uri || uploaded.file?.uri;
        if (!fileUri) throw new Error('Gemini did not return a file URI.');

        res.write('[Notice] File is ACTIVE. Starting analysis with Gemini 2.5 Pro…\n\n');

        // 5. Stream generation
        const model = genAI.getGenerativeModel({ model: MODEL }, { timeout: 5 * 60 * 1000 });
        const userQuery = (prompt || '').trim();
        let finalPrompt = DEFAULT_PROMPT;
        if (userQuery) finalPrompt += `\n\nADDITIONAL USER INSTRUCTION:\n${userQuery}`;

        const streamResp = await streamWithRetry(model, {
          contents: [{ parts: [{ text: finalPrompt }, { fileData: { mimeType, fileUri } }] }]
        }, {
          onRetry: async (nextAttempt, delayMs, e) => {
            res.write(`\n[Notice] Transient error (${e?.status || e?.code || 'unknown'}). Retrying attempt ${nextAttempt} in ${Math.round(delayMs/1000)}s…\n`);
          }
        });

        for await (const chunk of streamResp.stream) {
          const text = chunk?.text?.() || '';
          if (text) {
            analysisTextContent += text; // Capture output
            res.write(text);
          }
        }

        // 6. Move file and finalize job
        let savedUrl = null;
        if (hasFile && localPath) {
          try {
            // Ensure shared directory exists
            await fsp.mkdir(SHARED_DIR, { recursive: true });
            
            const newName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(localPath) || '.bin'}`;
            const newPath = path.join(SHARED_DIR, newName);
            
            // Use copyFile + unlink instead of rename to support cross-device moves
            await fsp.copyFile(localPath, newPath);
            await fsp.unlink(localPath);
            
            savedUrl = `/shared/${encodeURIComponent(newName)}`;
            res.write(`\n[Notice] File saved to: ${savedUrl}\n`);
            cleanupPath = null;
          } catch (moveErr) {
            console.error('Failed to save video file:', moveErr);
            res.write(`\n[Error] Failed to save video file to history: ${moveErr.message}\n`);
            // Continue anyway - job will be saved without video URL
            // Don't set cleanupPath = null, so the temp file gets cleaned up in finally block
          }
        } else if (hasUrl) {
          savedUrl = url; // Save the original YouTube URL
        }

        // 7. Update job as 'completed'
        const time_taken_ms = Date.now() - startTime;
        const finalJobName = extractTitle(analysisTextContent, userQuery, (hasFile ? req.file.originalname : null), (hasUrl ? url : null));
        db.prepare(`
          UPDATE analysis_jobs 
          SET status = 'completed', time_taken_ms = ?, analysis_text = ?, job_name = ?, video_url = ?
          WHERE job_id = ?
        `).run(time_taken_ms, analysisTextContent, finalJobName, savedUrl, jobId);

        res.write('\n');
      } catch (e) {
        // 8. Update job as 'failed'
        const time_taken_ms = Date.now() - startTime;
        const error_message = e?.message || String(e);
        db.prepare(`
          UPDATE analysis_jobs 
          SET status = 'failed', time_taken_ms = ?, error_message = ?
          WHERE job_id = ?
        `).run(time_taken_ms, error_message, jobId);

        const msg = `\n[Error] ${error_message}\n`;
        console.error(msg);
        if (!res.headersSent) return res.status(500).send(msg);
        else res.write(msg);
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
app.post('/share/upload', checkAuth, (req, res) => {
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
app.get('/api/share/:id', checkAuth, async (req, res) => {
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

// ---------- History API (now from SQLite) ----------
app.get('/api/history', checkAuth, (req, res) => {
  try {
    // Get all jobs (completed and failed) for the logged-in user
    const items = db.prepare(`
      SELECT job_id, job_name, analysis_text, video_url, file_name, created_at, analyzed_by_name, status
      FROM analysis_jobs 
      WHERE user_google_id = ? AND (status = 'completed' OR status = 'failed')
      ORDER BY created_at DESC
    `).all(req.user.google_id);

    // Map to the old format for frontend compatibility
    const history = items.map(item => ({
      id: item.job_id,
      name: item.job_name,
      analysisText: item.analysis_text,
      videoUrl: item.video_url,
      fileName: item.file_name,
      createdAt: new Date(item.created_at).getTime(),
      analyzedBy: item.analyzed_by_name ? item.analyzed_by_name.split(' ')[0].split('@')[0] : 'User',
      status: item.status // Add status to the response
    }));

    res.json(history);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get('/api/history/storage', checkAuth, (req, res) => {
  try {
    // Simplified storage check: just count text bytes for now
    const row = db.prepare(`
      SELECT SUM(LENGTH(analysis_text)) as total_text_bytes 
      FROM analysis_jobs 
      WHERE user_google_id = ?
    `).get(req.user.google_id);
    const used = row?.total_text_bytes || 0;
    // We'll add file size calculation later
    res.json({ used, total: TOTAL_STORAGE_BYTES });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /api/history is NO LONGER NEEDED (it's part of /upload)

app.put('/api/history/:id', checkAuth, (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
    const info = db.prepare(`
      UPDATE analysis_jobs 
      SET job_name = ? 
      WHERE job_id = ? AND user_google_id = ?
    `).run(name.trim(), id, req.user.google_id);
    if (info.changes === 0) return res.status(404).json({ message: 'Not found or no permission' });
    res.json({ ok: true });
  } catch (e) { 
    res.status(500).json({ message: e.message }); 
  }
});

app.delete('/api/history/:id', checkAuth, (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Get the item to find its video_url and verify ownership
    const item = db.prepare(
      'SELECT video_url, job_name FROM analysis_jobs WHERE job_id = ? AND user_google_id = ?'
    ).get(id, req.user.google_id);
    
    if (!item) {
      return res.status(404).json({ message: 'Not found or no permission' });
    }

    // 2. Delete the entire record from the database (this deletes all video data: analysis_text, video_url, file_name, etc.)
    const info = db.prepare(
      'DELETE FROM analysis_jobs WHERE job_id = ? AND user_google_id = ?'
    ).run(id, req.user.google_id);
    
    if (info.changes === 0) {
      return res.status(404).json({ message: 'Not found or already deleted' });
    }

    console.log(`Deleted analysis job "${item.job_name}" (ID: ${id}) from database`);

    // 3. (Best effort) Delete the associated video file from /shared directory
    if (item.video_url && item.video_url.startsWith('/shared/')) {
      const filename = decodeURIComponent(item.video_url.replace('/shared/', ''));
      const filePath = path.join(SHARED_DIR, filename);
      deleteIfExists(filePath)
        .then(() => console.log(`Deleted video file: ${filePath}`))
        .catch(err => console.error(`Failed to delete video file: ${filePath}`, err));
    }

    res.json({ ok: true, message: 'Analysis and video data deleted successfully' });
  } catch (e) { 
    console.error('Delete error:', e);
    res.status(500).json({ message: e.message || 'Failed to delete analysis' }); 
  }
});

// ---------- User Info API ----------
app.get('/api/user/me', checkAuth, (req, res) => {
  // Get admin emails from .env
  const adminEmailList = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  const userEmail = req.user?.email?.toLowerCase();
  const isAdmin = userEmail && adminEmailList.includes(userEmail);

  res.json({
    name: req.user.displayName || req.user.email.split('@')[0],
    email: req.user.email,
    isAdmin: isAdmin
  });
});

// ---------- ADMIN API ----------
// Health check endpoint (lightweight, no auth required for monitoring)
app.get('/api/admin/health', (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected'
    };

    // Test database connection
    try {
      db.prepare('SELECT 1').get();
      health.database = 'connected';
    } catch (err) {
      health.database = 'error';
      health.dbError = err.message;
    }

    res.json(health);
  } catch (e) {
    res.status(500).json({ 
      status: 'error',
      message: e.message 
    });
  }
});

// Stats endpoint (requires authentication + admin check)
app.get('/api/admin/stats', checkAuth, checkAdmin, (req, res) => {
  try {
    const stats = {
      users: {},
      logins: {},
      jobs: {}
    };

    // Get user stats
    stats.users.total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    // Get login stats
    stats.logins.total = db.prepare('SELECT COUNT(*) as count FROM login_logs').get().count;
    // Get most recent login for each user
    stats.logins.recent = db.prepare(`
      SELECT 
        l.timestamp, 
        u.display_name, 
        u.email,
        u.google_id
      FROM login_logs l
      JOIN users u ON l.user_google_id = u.google_id
      WHERE l.log_id IN (
        SELECT MAX(log_id) 
        FROM login_logs 
        GROUP BY user_google_id
      )
      ORDER BY l.timestamp DESC LIMIT 10
    `).all();

    // Get job stats
    stats.jobs.completed = db.prepare("SELECT COUNT(*) as count FROM analysis_jobs WHERE status = 'completed'").get().count;
    stats.jobs.failed = db.prepare("SELECT COUNT(*) as count FROM analysis_jobs WHERE status = 'failed'").get().count;
    stats.jobs.processing = db.prepare("SELECT COUNT(*) as count FROM analysis_jobs WHERE status = 'processing'").get().count;
    stats.jobs.avg_time_ms = db.prepare("SELECT AVG(time_taken_ms) as avg FROM analysis_jobs WHERE status = 'completed'").get().avg;
    stats.jobs.recent = db.prepare("SELECT * FROM analysis_jobs ORDER BY created_at DESC").all();

    // --- NEW STATS ---
    
    // 4. Get Total Analysis Time
    const totalTimeResult = db.prepare("SELECT SUM(time_taken_ms) as total FROM analysis_jobs WHERE status = 'completed'").get();
    stats.jobs.total_time_ms = totalTimeResult.total || 0;

    // 5. Get Most Active User
    const mostActiveResult = db.prepare(`
      SELECT 
        u.display_name, 
        COUNT(j.job_id) as job_count
      FROM analysis_jobs j
      JOIN users u ON j.user_google_id = u.google_id
      GROUP BY j.user_google_id
      ORDER BY job_count DESC
      LIMIT 1
    `).get();
    stats.users.most_active = mostActiveResult ? `${mostActiveResult.display_name} (${mostActiveResult.job_count} jobs)` : 'N/A';
    
    // --- END NEW STATS ---

    res.json(stats);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// --- NEW API ENDPOINT FOR USER LOGIN HISTORY ---
app.get('/api/admin/logins/:google_id', checkAuth, checkAdmin, (req, res) => {
  try {
    const { google_id } = req.params;
    const logins = db.prepare(`
      SELECT timestamp 
      FROM login_logs 
      WHERE user_google_id = ? 
      ORDER BY timestamp DESC
    `).all(google_id);

    res.json(logins);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Serve the main app page ONLY if authenticated
app.get('/', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Catch-all for any other routes (keep this last)
app.get('*', (req, res) => {
  res.redirect('/');
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on http://0.0.0.0:${PORT} (accessible from all network interfaces)`);
  console.log(`   Local access: http://localhost:${PORT}`);
});
server.headersTimeout = 0;
server.requestTimeout = 0;

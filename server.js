const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const JSZip = require('jszip');
const { createExtractorFromFile } = require('node-unrar-js');

// Auto-log to logs/server.log
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
const logFile = fs.createWriteStream(path.join(logDir, 'server.log'), { flags: 'a' });
const origStdout = process.stdout.write.bind(process.stdout);
const origStderr = process.stderr.write.bind(process.stderr);
process.stdout.write = (chunk, encoding, callback) => {
  logFile.write(chunk, encoding);
  return origStdout(chunk, encoding, callback);
};
process.stderr.write = (chunk, encoding, callback) => {
  logFile.write(chunk, encoding);
  return origStderr(chunk, encoding, callback);
};

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// --- PORTABLE DATA PATH ---
const dataPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

const thumbnailDir = path.join(dataPath, 'thumbnails');
if (!fs.existsSync(thumbnailDir)) {
  fs.mkdirSync(thumbnailDir, { recursive: true });
}

const settingsFile = path.join(dataPath, 'settings.json');
function readSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read settings.json:', e);
  }
  return { rootFolder: '', pinEnabled: false, pin: '' };
}

function writeSettings(data) {
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2), 'utf8');
    return data;
  } catch (e) {
    console.error('Failed to write settings.json:', e);
    return data;
  }
}

// Helpers
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function isValidImage(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  if (lower.startsWith('.') || lower.includes('__macosx')) return false;
  return /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(lower);
}

function getFileHash(filePath, mtimeMs) {
  return crypto.createHash('md5').update(`${filePath}_${mtimeMs}`).digest('hex');
}

function getImageMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

// --- SECURE AUTHENTICATION ---
// Credentials strictly stored and validated on the server side
const AUTH_USER = 'amirsubqi';
const AUTH_SALT = 'zenreader_cf_tunnel_secure_salt_2026';
const AUTH_PASS_HASH = crypto.createHash('sha256').update('$emogaAm4n' + AUTH_SALT).digest('hex');

const activeSessions = new Set();

function authMiddleware(req, res, next) {
  const token = req.cookies?.zen_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token && activeSessions.has(token)) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized', authenticated: false });
}

// 1. Auth routes
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const inputHash = crypto.createHash('sha256').update(password + AUTH_SALT).digest('hex');

  // Safe timing comparison
  const userMatch = username === AUTH_USER;
  const passMatch = crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(AUTH_PASS_HASH));

  if (userMatch && passMatch) {
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.add(token);

    res.cookie('zen_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return res.json({ success: true, token, username: AUTH_USER });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.zen_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token && activeSessions.has(token)) {
    return res.json({ authenticated: true, username: AUTH_USER });
  }
  return res.json({ authenticated: false });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.zen_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) activeSessions.delete(token);
  res.clearCookie('zen_session');
  return res.json({ success: true });
});

// --- PROTECTED COMIC APIS ---

// 2. Settings
app.get('/api/settings', authMiddleware, (req, res) => {
  res.json(readSettings());
});

app.post('/api/settings', authMiddleware, (req, res) => {
  res.json(writeSettings(req.body));
});

// 3. Scan Folder
app.post('/api/scan', authMiddleware, (req, res) => {
  const { rootPath } = req.body || {};
  if (!rootPath || !fs.existsSync(rootPath)) return res.json([]);

  const results = [];

  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          const ext = path.extname(entry.name).toLowerCase().replace('.', '');
          if (['cbz', 'cbr', 'pdf'].includes(ext)) {
            try {
              const stat = fs.statSync(fullPath);
              const rel = path.relative(rootPath, fullPath);
              const parts = rel.split(path.sep);
              const folderPathParts = parts.length > 1 ? parts.slice(0, -1) : [];
              const folderName = folderPathParts.length > 0 ? folderPathParts[folderPathParts.length - 1] : '';
              const title = path.basename(entry.name, path.extname(entry.name));

              results.push({
                title,
                filePath: fullPath,
                relativePath: rel,
                folderName,
                folderPathParts,
                format: ext,
                fileSize: stat.size,
                mtime: stat.mtimeMs
              });
            } catch (statErr) {
              console.error('Stat error on file:', fullPath, statErr);
            }
          }
        }
      }
    } catch (dirErr) {
      console.error('Failed to read directory:', dir, dirErr);
    }
  }

  walk(rootPath);
  results.sort((a, b) => naturalSort(a.title, b.title));
  res.json(results);
});

// 4. Get Cover
app.post('/api/cover', authMiddleware, async (req, res) => {
  const { filePath, format } = req.body || {};
  if (!filePath || !fs.existsSync(filePath)) return res.json(null);

  try {
    const stat = fs.statSync(filePath);
    const hash = getFileHash(filePath, stat.mtimeMs);
    const cachedThumbPath = path.join(thumbnailDir, `${hash}.jpg`);

    if (fs.existsSync(cachedThumbPath)) {
      const buf = fs.readFileSync(cachedThumbPath);
      return res.json(`data:image/jpeg;base64,${buf.toString('base64')}`);
    }

    if (format === 'cbz') {
      const data = fs.readFileSync(filePath);
      const zip = new JSZip();
      const loaded = await zip.loadAsync(data);
      const imageFiles = Object.keys(loaded.files)
        .filter(name => !loaded.files[name].dir && isValidImage(name))
        .sort(naturalSort);

      if (imageFiles.length > 0) {
        const coverBuf = await loaded.files[imageFiles[0]].async('nodebuffer');
        fs.writeFileSync(cachedThumbPath, coverBuf);
        const mime = getImageMime(imageFiles[0]);
        return res.json(`data:${mime};base64,${coverBuf.toString('base64')}`);
      }
    }

    if (format === 'cbr') {
      const extractor = await createExtractorFromFile({ filepath: filePath });
      const fileList = extractor.getFileList();
      const imageFiles = [];

      for (const header of fileList.fileHeaders) {
        if (!header.flags.directory && isValidImage(header.name)) {
          imageFiles.push(header.name);
        }
      }
      imageFiles.sort(naturalSort);

      if (imageFiles.length > 0) {
        const extracted = extractor.extract({ files: [imageFiles[0]] });
        for (const file of extracted.files) {
          if (file.extraction) {
            const buf = Buffer.from(file.extraction);
            fs.writeFileSync(cachedThumbPath, buf);
            const mime = getImageMime(imageFiles[0]);
            return res.json(`data:${mime};base64,${buf.toString('base64')}`);
          }
        }
      }
    }

    if (format === 'pdf') {
      return res.json({ isPdf: true, filePath });
    }
  } catch (err) {
    console.error('Error generating cover for:', filePath, err);
  }

  return res.json(null);
});

// 5. Save Generated Cover to Disk Cache
app.post('/api/save-cover', authMiddleware, (req, res) => {
  const { filePath, dataUrl } = req.body || {};
  if (!filePath || !dataUrl) return res.json(false);

  try {
    const stat = fs.statSync(filePath);
    const hash = getFileHash(filePath, stat.mtimeMs);
    const cachedThumbPath = path.join(thumbnailDir, `${hash}.jpg`);
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(cachedThumbPath, Buffer.from(base64Data, 'base64'));
    return res.json(true);
  } catch (err) {
    console.error('Failed to save cover cache for:', filePath, err);
    return res.json(false);
  }
});

// 6. Get Page List for a Comic
app.post('/api/page-list', authMiddleware, async (req, res) => {
  const { filePath, format } = req.body || {};
  if (!filePath || !fs.existsSync(filePath)) return res.json([]);

  try {
    if (format === 'cbz') {
      const data = fs.readFileSync(filePath);
      const zip = new JSZip();
      const loaded = await zip.loadAsync(data);
      const imageFiles = Object.keys(loaded.files)
        .filter(name => !loaded.files[name].dir && isValidImage(name))
        .sort(naturalSort);
      return res.json(imageFiles);
    }

    if (format === 'cbr') {
      const extractor = await createExtractorFromFile({ filepath: filePath });
      const fileList = extractor.getFileList();
      const imageFiles = [];
      for (const header of fileList.fileHeaders) {
        if (!header.flags.directory && isValidImage(header.name)) {
          imageFiles.push(header.name);
        }
      }
      return res.json(imageFiles.sort(naturalSort));
    }
  } catch (err) {
    console.error('Failed to get page list for:', filePath, err);
  }

  return res.json([]);
});

// 7. Get Single Page Image (On-demand streaming)
app.post('/api/page-data', authMiddleware, async (req, res) => {
  const { filePath, format, pageName } = req.body || {};
  if (!filePath || !fs.existsSync(filePath) || !pageName) return res.json(null);

  try {
    if (format === 'cbz') {
      const data = fs.readFileSync(filePath);
      const zip = new JSZip();
      const loaded = await zip.loadAsync(data);
      const fileEntry = loaded.files[pageName];
      if (fileEntry) {
        const buf = await fileEntry.async('nodebuffer');
        const mime = getImageMime(pageName);
        return res.json(`data:${mime};base64,${buf.toString('base64')}`);
      }
    }

    if (format === 'cbr') {
      const extractor = await createExtractorFromFile({ filepath: filePath });
      const extracted = extractor.extract({ files: [pageName] });
      for (const file of extracted.files) {
        if (file.extraction) {
          const buf = Buffer.from(file.extraction);
          const mime = getImageMime(pageName);
          return res.json(`data:${mime};base64,${buf.toString('base64')}`);
        }
      }
    }
  } catch (err) {
    console.error('Failed to get page data for:', pageName, err);
  }

  return res.json(null);
});

// 8. Read File Buffer (for PDF or binary streaming)
app.get('/api/file', authMiddleware, (req, res) => {
  const filePath = req.query.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'application/pdf',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': stat.size,
      'Content-Type': 'application/pdf',
      'Accept-Ranges': 'bytes',
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
});

// 9. Static Assets & SPA Fallback
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
  app.use((req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.send('ZenReader Server is running. Please run "npm run build" to build the web client.');
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`  ZenReader Web Server is running!`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`  Network/Tunnel: Ready for Cloudflare Tunnel`);
  console.log(`=========================================`);
});

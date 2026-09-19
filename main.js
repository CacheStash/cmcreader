const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const JSZip = require('jszip');
const { createExtractorFromFile } = require('node-unrar-js');

// --- PORTABLE DATA PATH ---
const dataPath = app.isPackaged 
  ? path.join(path.dirname(process.execPath), 'data') 
  : path.join(__dirname, 'data');

if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}
app.setPath('userData', dataPath);

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

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 650,
    icon: path.join(__dirname, 'build/icon.ico'),
    backgroundColor: '#000000',
    title: 'ZenReader - Comic Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
  });

  win.setMenuBarVisibility(false);

  // In dev mode or production
  const indexPath = path.join(__dirname, 'dist/index.html');
  if (fs.existsSync(indexPath)) {
    win.loadFile(indexPath);
  } else {
    win.loadURL('http://localhost:3000');
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Helper: Natural sort
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// Helper: check if file is valid image
function isValidImage(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  if (lower.startsWith('.') || lower.includes('__macosx')) return false;
  return /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(lower);
}

// Helper: Hash for thumbnail caching
function getFileHash(filePath, mtimeMs) {
  return crypto.createHash('md5').update(`${filePath}_${mtimeMs}`).digest('hex');
}

// Helper: Get image mime type
function getImageMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

// --- IPC HANDLERS ---

// 1. Select Folder Dialog
ipcMain.handle('dialog:select-folder', async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    title: 'Select Comic Root Folder (e.g. H:\\cmc)',
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 2. Settings
ipcMain.handle('settings:get', async () => {
  return readSettings();
});

ipcMain.handle('settings:save', async (_event, newSettings) => {
  return writeSettings(newSettings);
});

// 3. Scan Folder recursively for .cbz, .cbr, .pdf
ipcMain.handle('library:scan-folder', async (_event, rootPath) => {
  if (!rootPath || !fs.existsSync(rootPath)) return [];

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
              
              // Folder category: full nested path parts and innermost folder name
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
  return results.sort((a, b) => naturalSort(a.title, b.title));
});

// 4. Extract Cover Thumbnail & Disk Cache
ipcMain.handle('library:get-cover', async (_event, { filePath, format }) => {
  if (!filePath || !fs.existsSync(filePath)) return null;

  try {
    const stat = fs.statSync(filePath);
    const hash = getFileHash(filePath, stat.mtimeMs);
    const cachedThumbPath = path.join(thumbnailDir, `${hash}.jpg`);

    // Return cached thumbnail if exists
    if (fs.existsSync(cachedThumbPath)) {
      const buf = fs.readFileSync(cachedThumbPath);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }

    // Extract cover from CBZ
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
        return `data:${mime};base64,${coverBuf.toString('base64')}`;
      }
    }

    // Extract cover from CBR (RAR)
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
            return `data:${mime};base64,${buf.toString('base64')}`;
          }
        }
      }
    }

    // PDF cover: returned as signal to frontend
    if (format === 'pdf') {
      return { isPdf: true, filePath };
    }
  } catch (err) {
    console.error('Error generating cover for:', filePath, err);
  }

  return null;
});

// 4b. Save Generated Cover to Disk Cache (e.g. for PDF)
ipcMain.handle('library:save-cover', async (_event, { filePath, dataUrl }) => {
  if (!filePath || !dataUrl) return false;
  try {
    const stat = fs.statSync(filePath);
    const hash = getFileHash(filePath, stat.mtimeMs);
    const cachedThumbPath = path.join(thumbnailDir, `${hash}.jpg`);
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(cachedThumbPath, Buffer.from(base64Data, 'base64'));
    return true;
  } catch (err) {
    console.error('Failed to save cover cache for:', filePath, err);
    return false;
  }
});

// 5. Get Page List for a Comic
ipcMain.handle('comic:get-page-list', async (_event, { filePath, format }) => {
  if (!filePath || !fs.existsSync(filePath)) return [];

  try {
    if (format === 'cbz') {
      const data = fs.readFileSync(filePath);
      const zip = new JSZip();
      const loaded = await zip.loadAsync(data);
      const imageFiles = Object.keys(loaded.files)
        .filter(name => !loaded.files[name].dir && isValidImage(name))
        .sort(naturalSort);
      return imageFiles;
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
      return imageFiles.sort(naturalSort);
    }
  } catch (err) {
    console.error('Failed to get page list for:', filePath, err);
  }

  return [];
});

// 6. Get Single Page Image (On-demand streaming)
ipcMain.handle('comic:get-page-data', async (_event, { filePath, format, pageName }) => {
  if (!filePath || !fs.existsSync(filePath) || !pageName) return null;

  try {
    if (format === 'cbz') {
      const data = fs.readFileSync(filePath);
      const zip = new JSZip();
      const loaded = await zip.loadAsync(data);
      const fileEntry = loaded.files[pageName];
      if (fileEntry) {
        const buf = await fileEntry.async('nodebuffer');
        const mime = getImageMime(pageName);
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    }

    if (format === 'cbr') {
      const extractor = await createExtractorFromFile({ filepath: filePath });
      const extracted = extractor.extract({ files: [pageName] });
      for (const file of extracted.files) {
        if (file.extraction) {
          const buf = Buffer.from(file.extraction);
          const mime = getImageMime(pageName);
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      }
    }
  } catch (err) {
    console.error('Failed to get page data for:', pageName, err);
  }

  return null;
});

// 7. Read File Buffer (for PDF or fallback)
ipcMain.handle('comic:read-file', async (_event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

// 8. Open file in explorer
ipcMain.handle('shell:show-item', async (_event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});
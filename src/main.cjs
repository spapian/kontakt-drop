const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const sharp = require('sharp');
const { bestCanonicalName, cleanName, safeFileName, walkLibrary, parseSnpid, scoreArtworkCandidate } = require('./core.cjs');
const { composeKontaktArtwork } = require('./artwork.cjs');

const execFileAsync = promisify(execFile);
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1060, height: 760, minWidth: 840, minHeight: 650,
    backgroundColor: '#f7f7f8', title: 'Kontakt Drop', icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function decodeHtml(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 KontaktDrop/1.0' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Online search returned ${response.status}`);
  return response.text();
}

async function webTitles(query) {
  const html = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=8`);
  return [...html.matchAll(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => decodeHtml(m[1].replace(/<[^>]+>/g, ' '))).slice(0, 8);
}

async function imageResults(query, targetRatio, target) {
  const html = await fetchText(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=+filterui:imagesize-large+filterui:aspect-wide`);
  const results = [];
  const add = (data) => {
    if (!data.murl) return;
    const width = Number(data.ow || data.w || 0);
    const height = Number(data.oh || data.h || 0);
    results.push({
      url: data.murl, thumb: data.turl || data.murl, source: data.purl || '',
      width, height, target, score: scoreArtworkCandidate(width, height, targetRatio)
    });
  };
  for (const match of html.matchAll(/<a[^>]+class="[^"]*iusc[^"]*"[^>]+m="([^"]+)"/gi)) {
    try {
      const data = JSON.parse(decodeHtml(match[1]));
      add(data);
    } catch {}
    if (results.length >= 8) break;
  }
  if (!results.length) {
    for (const match of html.matchAll(/m="([^"\n]*&quot;murl&quot;:[^"\n]+)"/gi)) {
      try {
        const data = JSON.parse(decodeHtml(match[1]));
        add(data);
      } catch {}
      if (results.length >= 8) break;
    }
  }
  return results.sort((a, b) => b.score - a.score);
}

function backendSource() {
  return isDev ? path.join(app.getAppPath(), 'backend', 'kidc') : path.join(process.resourcesPath, 'kidc');
}

async function backendExe() {
  const source = backendSource();
  const target = path.join(app.getPath('userData'), 'kidc');
  await fs.promises.mkdir(target, { recursive: true });
  for (const entry of await fs.promises.readdir(source, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    const sourceStat = await fs.promises.stat(from);
    let copy = true;
    try { copy = (await fs.promises.stat(to)).size !== sourceStat.size; } catch {}
    if (copy) await fs.promises.copyFile(from, to);
  }
  return path.join(target, 'klt.exe');
}

async function runKidc(args, timeout = 120000) {
  const exe = await backendExe();
  return execFileAsync(exe, args, { cwd: path.dirname(exe), windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 });
}

async function downloadImage(source) {
  if (/^https?:/i.test(source)) {
    const response = await fetch(source, { headers: { 'User-Agent': 'Mozilla/5.0 KontaktDrop/1.0' }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Artwork download returned ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return fs.promises.readFile(source);
}

async function installArtwork(source, libraryPath, name, optionsLayout = {}) {
  if (!source) return { installed: false };
  const input = await downloadImage(source);
  const publicDocs = process.env.PUBLIC || 'C:\\Users\\Public';
  const imageDir = path.join(publicDocs, 'Documents', 'NI Resources', 'image', safeFileName(name));
  await fs.promises.mkdir(imageDir, { recursive: true });
  const browserArt = path.join(imageDir, 'MST_artwork.png');
  const legacyArt = path.join(libraryPath, 'wallpaper.png');
  await fs.promises.writeFile(browserArt, await composeKontaktArtwork(input, 536, 264, optionsLayout.browser));
  await fs.promises.writeFile(legacyArt, await composeKontaktArtwork(input, 598, 98, optionsLayout.legacy));
  return { installed: true, browserArt, legacyArt };
}

ipcMain.handle('choose-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose a Kontakt library folder' });
  return result.canceled ? '' : result.filePaths[0];
});

ipcMain.handle('analyze-library', async (_event, folder) => {
  const stat = await fs.promises.stat(folder);
  if (!stat.isDirectory()) throw new Error('Drop a folder, not an individual file.');
  const files = await walkLibrary(folder);
  const localImages = await Promise.all(files.images.slice(0, 12).map(async (imagePath) => {
    try {
      const metadata = await sharp(imagePath).metadata();
      const browserScore = scoreArtworkCandidate(metadata.width, metadata.height, 536 / 264);
      const legacyScore = scoreArtworkCandidate(metadata.width, metadata.height, 598 / 98);
      return {
        path: imagePath, width: metadata.width || 0, height: metadata.height || 0,
        target: legacyScore > browserScore ? 'legacy' : 'browser',
        score: Math.max(browserScore, legacyScore)
      };
    } catch { return { path: imagePath, width: 0, height: 0, target: '', score: 0 }; }
  }));
  return {
    folder, folderName: path.basename(folder), parent: path.dirname(folder),
    instrumentCount: files.instruments.length, existingNicnt: files.nicnt,
    localImages,
    instrumentHints: files.instruments.slice(0, 8).map((x) => cleanName(path.basename(x, path.extname(x)))),
    truncated: files.truncated
  };
});

ipcMain.handle('search-library', async (_event, analysis) => {
  const seed = cleanName(analysis.folderName) || analysis.folderName;
  const hint = analysis.instrumentHints?.[0] || '';
  let titles = [], images = [], error = '';
  try {
    titles = await webTitles(`${seed} ${hint} Kontakt library`);
    const match = bestCanonicalName(seed, titles);
    const canonical = match.candidate || seed;
    try {
      const [wallpapers, browserTiles] = await Promise.all([
        imageResults(`"${canonical}" Kontakt wallpaper 598x98 banner`, 598 / 98, 'legacy'),
        imageResults(`"${canonical}" Kontakt library artwork 536x264 banner`, 536 / 264, 'browser')
      ]);
      const seen = new Set();
      images = [...wallpapers, ...browserTiles]
        .sort((a, b) => b.score - a.score)
        .filter((item) => !seen.has(item.url) && seen.add(item.url))
        .slice(0, 16);
    } catch (e) { error = e.message; }
    return { canonical, confidence: match.score, matchedTitle: match.title, images, error };
  } catch (e) {
    return { canonical: seed, confidence: 0, matchedTitle: '', images, error: e.message };
  }
});

ipcMain.handle('prepare-library', async (_event, options) => {
  let libraryPath = options.folder;
  const name = safeFileName(options.name);
  if (!name) throw new Error('Enter a valid library name.');
  const scan = await walkLibrary(libraryPath);
  if (!scan.instruments.length) throw new Error('No Kontakt instrument files (.nki, .nkm or .nkb) were found.');
  if (options.rename && path.basename(libraryPath) !== name) {
    const next = path.join(path.dirname(libraryPath), name);
    try { await fs.promises.access(next); throw new Error(`Cannot rename: “${name}” already exists beside this folder.`); } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    await fs.promises.rename(libraryPath, next);
    libraryPath = next;
  }
  let after = await walkLibrary(libraryPath);
  if (!after.nicnt.length) {
    try { await runKidc(['--scan', '--quiet', '--limit', '3', '--libdir', path.dirname(libraryPath)]); } catch {}
    await runKidc(['--build', '--nicnt', '--name', name, '--company', 'Personal Library', '--version', '1.0.0', '--ras2', '--path', libraryPath]);
    after = await walkLibrary(libraryPath);
  }
  if (!after.nicnt.length) throw new Error('The metadata tool finished without creating a .nicnt file.');
  const nicntPath = after.nicnt.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const snpid = parseSnpid(await fs.promises.readFile(nicntPath, 'utf8'));
  let artwork = { installed: false };
  let artworkError = '';
  try { artwork = await installArtwork(options.artwork, libraryPath, name, options.artworkLayout || {}); } catch (e) { artworkError = e.message; }
  return { libraryPath, nicntPath, snpid, artwork, artworkError };
});

ipcMain.handle('open-path', async (_event, target) => shell.openPath(target));
ipcMain.handle('open-kontakt', async () => {
  const candidates = [
    'C:\\Program Files\\Native Instruments\\Kontakt 8\\Kontakt 8.exe',
    'C:\\Program Files\\Native Instruments\\Kontakt 7\\Kontakt 7.exe',
    'C:\\Program Files\\Native Instruments\\Kontakt\\Kontakt.exe'
  ];
  for (const candidate of candidates) if (fs.existsSync(candidate)) { await shell.openPath(candidate); return { opened: true, path: candidate }; }
  return { opened: false };
});

app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

const fs = require('node:fs');
const path = require('node:path');

const instrumentExts = new Set(['.nki', '.nkm', '.nkb']);
const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const imageWords = /(?:wallpaper|artwork|cover|banner|library|product)/i;

function cleanName(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(?:kontakt|library|instruments?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFileName(value) {
  return String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '').trim();
}

function tokenize(value) {
  return new Set(cleanName(value).toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 1));
}

function overlapScore(a, b) {
  const left = tokenize(a);
  const right = tokenize(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

function extractTitle(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function bestCanonicalName(folderName, titles) {
  const base = cleanName(folderName) || folderName;
  const choices = titles.map(extractTitle).map((title) => {
    const candidate = title.split(/\s+[|–—:]\s+/)[0].replace(/\s*[-–—]?\s*(?:Kontakt|Native Instruments).*$/i, '').trim();
    return { candidate, title, score: overlapScore(base, candidate) };
  }).filter((x) => x.candidate.length >= 3);
  choices.sort((a, b) => b.score - a.score);
  const best = choices[0];
  return best && best.score >= 0.6 ? best : { candidate: base, title: '', score: 0 };
}

async function walkLibrary(root, limit = 8000) {
  const instruments = [];
  const images = [];
  const nicnt = [];
  const queue = [root];
  let seen = 0;
  while (queue.length && seen < limit) {
    const current = queue.shift();
    let entries;
    try { entries = await fs.promises.readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (++seen > limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else {
        const ext = path.extname(entry.name).toLowerCase();
        if (instrumentExts.has(ext)) instruments.push(full);
        else if (ext === '.nicnt') nicnt.push(full);
        else if (imageExts.has(ext) && imageWords.test(entry.name)) images.push(full);
      }
    }
  }
  return { instruments, images, nicnt, truncated: seen >= limit };
}

function parseSnpid(xml) {
  const match = String(xml).match(/<SNPID>\s*([^<]+?)\s*<\/SNPID>/i);
  return match ? match[1].trim() : '';
}

function scoreArtworkCandidate(width, height, targetRatio) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h || !targetRatio) return 0;
  const aspectScore = Math.exp(-Math.abs(Math.log((w / h) / targetRatio)) * 2.4);
  const resolutionScore = Math.min(1, Math.sqrt(w * h) / 1400);
  return (aspectScore * 0.78) + (resolutionScore * 0.22);
}

module.exports = { bestCanonicalName, cleanName, safeFileName, overlapScore, walkLibrary, parseSnpid, scoreArtworkCandidate };

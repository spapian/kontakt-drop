const $ = (id) => document.getElementById(id);
const views = ['dropView', 'reviewView', 'workingView', 'doneView', 'errorView'];
let analysis, search, lastResult;
let artwork = [], artworkIndex = 0;
let frameMode = 'browser';
let artworkLayout = createLayouts();
let dragStart = null;

function createLayouts() {
  return { browser: { zoom: 1, x: 0, y: 0 }, legacy: { zoom: 1, x: 0, y: 0 } };
}

function show(id) { views.forEach((view) => $(view).classList.toggle('active', view === id)); }
function fileUrl(value) { return encodeURI(`file:///${value.replace(/\\/g, '/')}`); }
function host(value) { try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return ''; } }
function updateFrame() {
  const layout = artworkLayout[frameMode];
  const image = $('artImage');
  const stage = $('artPreview');
  stage.classList.toggle('browser-frame', frameMode === 'browser');
  stage.classList.toggle('legacy-frame', frameMode === 'legacy');
  document.querySelectorAll('.frame-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.frame === frameMode));
  $('frameSize').textContent = frameMode === 'browser' ? '536 × 264' : '598 × 98';
  $('artZoom').value = Math.round(layout.zoom * 100);
  $('zoomValue').textContent = `${Math.round(layout.zoom * 100)}%`;
  image.style.left = `${50 + (layout.x * 50)}%`;
  image.style.top = `${50 + (layout.y * 50)}%`;
  image.style.transform = `translate(-50%, -50%) scale(${layout.zoom})`;
}
function renderArtwork() {
  const selected = artwork[artworkIndex];
  if (!selected) {
    $('artImage').removeAttribute('src');
    $('artBackdrop').removeAttribute('src');
    $('artImage').hidden = true;
    $('artBackdrop').hidden = true;
    $('noArtwork').hidden = false;
    $('artSource').textContent = 'You can continue without artwork.';
    $('nextArt').hidden = true;
    updateFrame();
    return;
  }
  $('artImage').src = selected.preview;
  $('artBackdrop').src = selected.preview;
  $('artImage').hidden = false;
  $('artBackdrop').hidden = false;
  $('noArtwork').hidden = true;
  const sourceParts = [selected.local ? 'Local artwork' : 'Online image'];
  if (selected.width && selected.height) sourceParts.push(`${selected.width} × ${selected.height}px`);
  if (selected.target) sourceParts.push(selected.target === 'legacy' ? 'wallpaper-shaped result' : 'browser-tile result');
  if (!selected.local && host(selected.source)) sourceParts.push(host(selected.source));
  sourceParts.push(`${artworkIndex + 1} of ${artwork.length}`);
  $('artSource').textContent = sourceParts.join(' · ');
  $('nextArt').hidden = artwork.length < 2;
  updateFrame();
}
function showError(error, back = 'reviewView') {
  $('errorMessage').textContent = error?.message || String(error);
  $('errorBack').dataset.back = back;
  show('errorView');
}
async function loadFolder(folder) {
  show('workingView');
  try {
    analysis = await window.kontaktDrop.analyze(folder);
    search = await window.kontaktDrop.search(analysis);
    artwork = [
      ...analysis.localImages.map((item) => ({ value: item.path, preview: fileUrl(item.path), source: item.path, local: true, width: item.width, height: item.height, target: item.target, score: item.score })),
      ...search.images.map((x) => ({ value: x.url, preview: x.thumb || x.url, source: x.source, local: false, width: x.width, height: x.height, target: x.target, score: x.score }))
    ].sort((a, b) => (b.score || 0) - (a.score || 0));
    artworkIndex = 0;
    artworkLayout = createLayouts();
    frameMode = 'browser';
    $('folderName').textContent = analysis.folderName;
    $('instrumentCount').textContent = analysis.instrumentCount.toLocaleString();
    $('nicntStatus').textContent = analysis.existingNicnt.length ? 'FOUND — WILL KEEP IT' : 'NONE';
    $('matchStatus').textContent = search.confidence >= .6 ? `${Math.round(search.confidence * 100)}% MATCH` : 'NAME NOT CONFIRMED';
    $('libraryName').value = search.canonical || analysis.folderName;
    $('matchNote').textContent = search.matchedTitle ? `Matched online result: “${search.matchedTitle}”. Check the name and image before preparing.` : `No strong online match was found. The existing folder name is kept for you to confirm.${search.error ? ` (${search.error})` : ''}`;
    renderArtwork(); show('reviewView');
  } catch (error) { showError(error, 'dropView'); }
}

$('dropZone').addEventListener('click', async () => { const folder = await window.kontaktDrop.chooseFolder(); if (folder) loadFolder(folder); });
$('dropZone').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') $('dropZone').click(); });
['dragenter', 'dragover'].forEach((event) => $('dropZone').addEventListener(event, (e) => { e.preventDefault(); $('dropZone').classList.add('drag'); }));
['dragleave', 'drop'].forEach((event) => $('dropZone').addEventListener(event, (e) => { e.preventDefault(); $('dropZone').classList.remove('drag'); }));
$('dropZone').addEventListener('drop', (e) => { const file = e.dataTransfer.files[0]; if (file) loadFolder(window.kontaktDrop.filePath(file)); });
$('nextArt').addEventListener('click', () => { artworkIndex = (artworkIndex + 1) % artwork.length; artworkLayout = createLayouts(); renderArtwork(); });
$('artZoom').addEventListener('input', (event) => { artworkLayout[frameMode].zoom = Number(event.target.value) / 100; updateFrame(); });
$('resetPosition').addEventListener('click', () => { artworkLayout[frameMode] = { zoom: 1, x: 0, y: 0 }; updateFrame(); });
document.querySelectorAll('.frame-tab').forEach((tab) => tab.addEventListener('click', () => { frameMode = tab.dataset.frame; updateFrame(); }));
$('artPreview').addEventListener('pointerdown', (event) => {
  if (!artwork.length) return;
  dragStart = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: artworkLayout[frameMode].x, y: artworkLayout[frameMode].y };
  $('artPreview').setPointerCapture(event.pointerId);
  $('artPreview').classList.add('dragging');
});
$('artPreview').addEventListener('pointermove', (event) => {
  if (!dragStart || dragStart.pointerId !== event.pointerId) return;
  const bounds = $('artPreview').getBoundingClientRect();
  artworkLayout[frameMode].x = Math.max(-1.5, Math.min(1.5, dragStart.x + ((event.clientX - dragStart.clientX) / (bounds.width / 2))));
  artworkLayout[frameMode].y = Math.max(-1.5, Math.min(1.5, dragStart.y + ((event.clientY - dragStart.clientY) / (bounds.height / 2))));
  updateFrame();
});
function endDrag(event) {
  if (!dragStart || dragStart.pointerId !== event.pointerId) return;
  dragStart = null;
  $('artPreview').classList.remove('dragging');
}
$('artPreview').addEventListener('pointerup', endDrag);
$('artPreview').addEventListener('pointercancel', endDrag);
$('backButton').addEventListener('click', () => show('dropView'));
$('errorBack').addEventListener('click', () => show($('errorBack').dataset.back || 'reviewView'));
$('restart').addEventListener('click', () => { analysis = search = lastResult = null; artwork = []; show('dropView'); });
$('prepareButton').addEventListener('click', async () => {
  show('workingView');
  try {
    const selected = artwork[artworkIndex];
    lastResult = await window.kontaktDrop.prepare({ folder: analysis.folder, name: $('libraryName').value.trim(), rename: $('renameFolder').checked, artwork: selected?.value || '', artworkLayout });
    $('doneName').textContent = $('libraryName').value.trim();
    $('doneSnpid').textContent = lastResult.snpid || 'GENERATED';
    $('doneNicnt').textContent = lastResult.nicntPath.split(/[\\/]/).pop();
    $('doneArtwork').textContent = lastResult.artwork.installed ? 'INSTALLED' : (lastResult.artworkError ? 'FAILED' : 'SKIPPED');
    show('doneView');
  } catch (error) { showError(error); }
});
$('openFolder').addEventListener('click', () => window.kontaktDrop.openPath(lastResult.libraryPath));
$('openKontakt').addEventListener('click', async () => { const result = await window.kontaktDrop.openKontakt(); if (!result.opened) showError(new Error('Kontakt 7 or 8 was not found in the standard Native Instruments folder.'), 'doneView'); });

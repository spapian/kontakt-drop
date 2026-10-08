const sharp = require('sharp');

// Preserve the complete source over a softened full-bleed background. This
// keeps titles and logos visible when square covers become wide banners.
async function composeKontaktArtwork(input, width, height, layout = {}) {
  const margin = Math.max(4, Math.round(Math.min(width, height) * 0.045));
  const normalized = await sharp(input).rotate().png().toBuffer();
  const metadata = await sharp(normalized).metadata();
  const zoom = Math.max(1, Math.min(12, Number(layout.zoom) || 1));
  const x = Math.max(-1.5, Math.min(1.5, Number(layout.x) || 0));
  const y = Math.max(-1.5, Math.min(1.5, Number(layout.y) || 0));
  const background = await sharp(normalized)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .blur(Math.max(8, Math.round(height / 12)))
    .modulate({ brightness: 0.48, saturation: 0.78 })
    .png()
    .toBuffer();
  const baseScale = Math.min((width - (margin * 2)) / metadata.width, (height - (margin * 2)) / metadata.height);
  const foregroundWidth = Math.max(1, Math.round(metadata.width * baseScale * zoom));
  const foregroundHeight = Math.max(1, Math.round(metadata.height * baseScale * zoom));
  const foreground = await sharp(normalized)
    .resize(foregroundWidth, foregroundHeight, { fit: 'fill' })
    .png()
    .toBuffer();
  const left = Math.round((width - foregroundWidth) / 2 + (x * width / 2));
  const top = Math.round((height - foregroundHeight) / 2 + (y * height / 2));
  const sourceLeft = Math.max(0, -left);
  const sourceTop = Math.max(0, -top);
  const targetLeft = Math.max(0, left);
  const targetTop = Math.max(0, top);
  const visibleWidth = Math.min(foregroundWidth - sourceLeft, width - targetLeft);
  const visibleHeight = Math.min(foregroundHeight - sourceTop, height - targetTop);
  const canvas = sharp(background);
  if (visibleWidth <= 0 || visibleHeight <= 0) return canvas.png().toBuffer();
  const visibleForeground = await sharp(foreground)
    .extract({ left: sourceLeft, top: sourceTop, width: visibleWidth, height: visibleHeight })
    .png()
    .toBuffer();
  return canvas.composite([{ input: visibleForeground, left: targetLeft, top: targetTop }]).png().toBuffer();
}

module.exports = { composeKontaktArtwork };

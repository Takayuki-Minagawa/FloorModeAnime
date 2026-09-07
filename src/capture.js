import { Color } from 'three';

/** Capture helpers shared by PNG and MediaRecorder. */
export function captureSize(width, height, fallbackWidth, fallbackHeight) {
  const valid = value => Number.isInteger(value) && value >= 64 && value <= 8192;
  const w = width ?? Math.max(64, Math.round(fallbackWidth));
  const h = height ?? Math.max(64, Math.round(fallbackHeight));
  if (!valid(w) || !valid(h) || w * h > 33554432) {
    throw new Error('E_CAPTURE_SIZE: image dimensions must be 64–8192 pixels (at most 32 megapixels)');
  }
  return { width: w, height: h };
}

export function supportedVideoType(Recorder = globalThis.MediaRecorder) {
  if (!Recorder?.isTypeSupported) return null;
  for (const mimeType of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']) {
    if (Recorder.isTypeSupported(mimeType)) return { mimeType, extension: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm' };
  }
  return null;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    // The browser must consume the object URL before it is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function canvasBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('E_CAPTURE_BLOB: browser could not encode the image'));
  }, type));
}

/** Sample the same linear-light color interpolation used by the WebGL
 * vertex colors, then encode stops as sRGB for Canvas/CSS gradients.
 */
export function responseColorStops(min, max) {
  const maxAbs = Math.max(Math.abs(min), Math.abs(max), Number.EPSILON);
  const white = new Color(0xf3f5f7), blue = new Color(0x2554c7), red = new Color(0xd52b1e);
  const color = new Color();
  return Array.from({ length: 21 }, (_, i) => {
    const ratio = i / 20;
    const value = (min / maxAbs) * (1 - ratio) + (max / maxAbs) * ratio;
    return [i / 20, color.copy(white).lerp(value < 0 ? blue : red, Math.abs(value)).getStyle()];
  });
}

export function responseGradient(min, max) {
  return `linear-gradient(90deg, ${responseColorStops(min, max).map(([offset, color]) => `${color} ${offset * 100}%`).join(', ')})`;
}

/** All caller-visible strings are supplied by the localized UI. */
export function drawCaptureAnnotations(context, width, height, metadata, labels, isDark) {
  const fontSize = Math.max(12, Math.round(width / 90));
  const padding = fontSize;
  const fg = isDark ? '#edf2fa' : '#172334';
  context.font = `${fontSize}px sans-serif`;
  context.textBaseline = 'middle';
  context.lineWidth = Math.max(3, fontSize / 3);
  for (const label of labels) {
    context.strokeStyle = isDark ? '#172334' : '#fff';
    context.fillStyle = fg;
    context.strokeText(label.text, label.x, label.y);
    context.fillText(label.text, label.x, label.y);
  }
  const lines = [metadata.title, ...(metadata.lines ?? [])].filter(Boolean).flatMap(text => {
    const result = [];
    let line = '';
    for (const character of String(text)) {
      if (line && context.measureText(line + character).width > width - padding * 4) {
        result.push(line); line = '';
      }
      line += character;
    }
    result.push(line);
    return result;
  });
  if (lines.length) {
    const panelHeight = Math.min(height - padding * 2, (lines.length + 1) * fontSize * 1.5);
    context.fillStyle = isDark ? 'rgba(15,23,35,.9)' : 'rgba(255,255,255,.9)';
    context.fillRect(padding, padding, width - padding * 2, panelHeight);
    context.fillStyle = fg;
    lines.forEach((line, i) => {
      if ((i + 1) * fontSize * 1.5 < panelHeight) context.fillText(line, padding * 2, padding + (i + 1) * fontSize * 1.5);
    });
  }
  if (metadata.legend) {
    const { min, max, unit = '', label = '' } = metadata.legend;
    const barWidth = Math.min(width - padding * 4, width * 0.45);
    const left = padding * 2, top = height - padding * 5;
    context.fillStyle = isDark ? 'rgba(15,23,35,.9)' : 'rgba(255,255,255,.9)';
    context.fillRect(padding, top - padding * 2, barWidth + padding * 2, padding * 6);
    const gradient = context.createLinearGradient(left, 0, left + barWidth, 0);
    for (const [offset, color] of responseColorStops(min, max)) gradient.addColorStop(offset, color);
    context.fillStyle = gradient;
    context.fillRect(left, top, barWidth, padding);
    context.fillStyle = fg;
    context.fillText(`${label} [${unit}]`, left, top - padding);
    context.fillText(String(min), left, top + padding * 2);
    const end = String(max);
    context.fillText(end, left + barWidth - context.measureText(end).width, top + padding * 2);
  }
}

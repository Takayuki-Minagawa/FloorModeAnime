/** Download helpers shared by data, settings and reports. */
export function downloadBlob(content, filename, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function readTextFiles(files, signal) {
  return Promise.all(Array.from(files).map(file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new DOMException('Cancelled', 'AbortError')); };
    const clean = () => signal?.removeEventListener('abort', abort);
    reader.onload = () => { clean(); resolve({ name: file.name, text: reader.result }); };
    reader.onerror = () => { clean(); reject(reader.error); };
    reader.onabort = clean;
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    reader.readAsText(file);
  })));
}

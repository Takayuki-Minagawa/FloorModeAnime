import { parseValidatedSource } from './data/load-source.js';

const abortError = () => new DOMException('Loading was cancelled', 'AbortError');

/**
 * Asynchronous input: original JSON string, named {name,text,bytes?} records,
 * or browser File/Blob array. Progress reports {stage,progress} in [0,1].
 * Cancellation terminates parsing workers; late results cannot resolve.
 */
export async function loadFloorSource(source, { signal, onProgress = () => {} } = {}) {
  if (signal?.aborted) throw abortError();
  onProgress({ stage: 'reading', progress: 0 });
  let worker;
  let settled = false;
  return new Promise((resolve, reject) => {
    const cleanup = () => { worker?.terminate(); signal?.removeEventListener('abort', abort); };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(value);
    };
    const abort = () => finish(reject, abortError());
    const progress = (update) => { if (!settled) onProgress(update); };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    const run = async () => {
      const prepared = Array.isArray(source) ? await Promise.all(source.map(async (file) => {
        if (typeof file.arrayBuffer !== 'function') return file;
        const bytes = new Uint8Array(await file.arrayBuffer());
        return { name: file.name ?? 'input.json', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), bytes };
      })) : source;
      if (settled) return;
      if (typeof Worker !== 'undefined') {
        try { worker = new Worker(new URL('./load-worker.js', import.meta.url), { type: 'module' }); }
        catch { /* Unavailable Worker constructor: use the synchronous compatibility API. */ }
      }
      if (worker) {
        worker.onmessage = ({ data: message }) => {
          if (message.type === 'progress') progress({ stage: message.stage, progress: message.progress });
          else if (message.type === 'result') finish(resolve, message.data);
          else if (message.type === 'error') {
            const error = new Error(message.message);
            error.issues = message.issues;
            finish(reject, error);
          }
        };
        worker.onerror = (event) => finish(reject, new Error(`E_LOAD_WORKER: ${event.message}`));
        worker.postMessage(prepared);
      } else {
        // Yield before compatibility parsing so an already requested cancel wins.
        await new Promise((next) => setTimeout(next, 0));
        if (!settled) finish(resolve, parseValidatedSource(prepared, progress));
      }
    };
    run().catch((error) => finish(reject, error));
  });
}

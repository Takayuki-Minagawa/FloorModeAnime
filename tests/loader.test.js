import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadFloorSource } from '../src/loader.js';
import { parseFloorData } from '../src/parser.js';
import { parseValidatedSource } from '../src/data/load-source.js';
import { bytesFileHash } from '../src/integrity.js';

const text = readFileSync(new URL('../public/Sample/sample_case.json', import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('asynchronous source loader', () => {
  it('matches synchronous parsing with ordered progress and validation issues', async () => {
    const progress = [];
    const data = await loadFloorSource(text, { onProgress: (update) => progress.push(update) });
    expect(data.nodes).toEqual(parseFloorData(text).nodes);
    expect(data.modes).toEqual(parseFloorData(text).modes);
    expect(data.identity).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(progress.map((p) => p.stage)).toEqual(['reading', 'parsing', 'validating', 'aggregating', 'complete']);
    await expect(loadFloorSource('{}')).rejects.toMatchObject({ issues: { errors: expect.any(Array) } });
  });

  it('rejects pre-aborted loads and cancellation before parsing', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(loadFloorSource(text, { signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const next = new AbortController();
    const pending = loadFloorSource(text, { signal: next.signal });
    next.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const duringProgress = new AbortController();
    await expect(loadFloorSource(text, {
      signal: duringProgress.signal, onProgress: () => duringProgress.abort(),
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('terminates its Worker on cancel and ignores stale messages', async () => {
    let worker;
    vi.stubGlobal('Worker', class {
      constructor() { worker = this; }
      postMessage = vi.fn();
      terminate = vi.fn();
    });
    const abort = new AbortController(), progress = vi.fn();
    const pending = loadFloorSource(text, { signal: abort.signal, onProgress: progress });
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    worker.onmessage({ data: { type: 'progress', stage: 'complete', progress: 1 } });
    worker.onmessage({ data: { type: 'result', data: {} } });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledTimes(1);
  });

  it('runs the same parser in a Worker and releases it after success', async () => {
    let worker;
    vi.stubGlobal('Worker', class {
      constructor() { worker = this; }
      terminate = vi.fn();
      postMessage(source) {
        queueMicrotask(() => this.onmessage({ data: { type: 'result', data: parseValidatedSource(source) } }));
      }
    });
    const loaded = await loadFloorSource(text);
    expect(loaded.modes).toEqual(parseFloorData(text).modes);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('preserves original bytes for manifest hashes even when a UTF-8 BOM is decoded away', async () => {
    const names = ['Test0202_calc.yaml', 'Test0202_calc_go_modal_result.json', 'Test0202_manifest.json'];
    const files = names.map((name) => ({ name, bytes: new Uint8Array(readFileSync(new URL(`../public/Sample/${name}`, import.meta.url))) }));
    const original = files[0].bytes;
    files[0].bytes = new Uint8Array([239, 187, 191, ...original]);
    const manifest = JSON.parse(new TextDecoder().decode(files[2].bytes));
    manifest.model.sha256 = bytesFileHash(files[0].bytes);
    manifest.model.size = files[0].bytes.length;
    files[2].bytes = new TextEncoder().encode(JSON.stringify(manifest));
    const source = files.map((file) => ({ name: file.name, arrayBuffer: async () => file.bytes.buffer }));
    const loaded = await loadFloorSource(source);
    expect(loaded.nodes.size).toBe(76);
    expect(loaded.contract.errors).toEqual([]);
  });
});

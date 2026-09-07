// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../src/app.js';
import { parseFloorData } from '../src/parser.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const sample = readFileSync(resolve(root, 'public/Sample/sample_case.json'), 'utf8');
const makeData = title => ({ ...parseFloorData(sample), meta: { title } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

let application, viewer, tools, frames, clock, nextId;
class MockViewer {
  constructor() {
    viewer = this;
    for (const method of ['setRenderRequest', 'resize', 'dispose', 'loadFloorData', 'updateDeformed', 'setVisibility', 'setLineStyle', 'setThemeColors', 'setView', 'setHighlightNode']) this[method] = vi.fn();
    this.getLineColors = vi.fn(() => ({ undeformedColor: '#888888', deformedColor: '#ff4444' }));
    this.render = vi.fn(() => false);
    this.savePNG = vi.fn(async () => {});
  }
}
function create(loader) {
  tools = { update: vi.fn(), dispose: vi.fn(), resize: vi.fn(), isRecording: () => false, cancelRecording: vi.fn() };
  application = createApplication({ FloorViewer: MockViewer, loader, toolsFactory: () => tools });
  return application;
}
function flushFrame() {
  const pending = [...frames.values()];
  frames.clear(); clock += 16;
  for (const callback of pending) callback(clock);
}

beforeEach(() => {
  document.body.innerHTML = html.split('<body>')[1].split('</body>')[0].replace(/<script[\s\S]*?<\/script>/g, '');
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
  frames = new Map(); clock = 0; nextId = 1;
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { const id = nextId++; frames.set(id, callback); return id; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn(id => frames.delete(id)));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
});
afterEach(() => {
  application?.dispose(); application = null;
  vi.unstubAllGlobals();
});

describe('application lifecycle with real shell and playback UI', () => {
  it('recovers from failed initial data while keeping file selection usable', async () => {
    const data = makeData('Recovered');
    const loader = vi.fn().mockRejectedValueOnce(new Error('E_FETCH: HTTP 404')).mockResolvedValue(data);
    const app = create(loader);
    expect(await app.load('missing', 'missing.json')).toBe(false);
    expect(document.body.dataset.ready).toBe('false');
    expect(document.getElementById('btn-select-file').disabled).toBe(false);
    expect(document.getElementById('btn-play').disabled).toBe(true);
    expect(document.getElementById('error-container').textContent).toContain('HTTP 404');
    expect(await app.load('valid', 'valid.json')).toBe(true);
    expect(app.getState().data).toBe(data);
    expect(document.body.dataset.ready).toBe('true');
    expect(document.getElementById('file-name-display').textContent).toBe('valid.json');
    expect(document.getElementById('error-container').textContent).toBe('');
  });

  it('shows structured validation errors and warnings returned by the loader', async () => {
    const error = new Error('Validation failed');
    error.issues = { errors: [{ code: 'E_BAD', message: 'E_BAD: missing node' }], warnings: [] };
    const data = makeData('With warning');
    data.validationWarnings = [{ code: 'W_ZERO', message: 'W_ZERO: zero mode' }];
    const app = create(vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(data));
    expect(await app.load('invalid')).toBe(false);
    expect(document.getElementById('error-container').textContent).toContain('E_BAD: missing node');
    expect(await app.load('valid')).toBe(true);
    expect(document.getElementById('error-container').textContent).toContain('W_ZERO: zero mode');
  });

  it('commits only the newest overlapping load even if the aborted loader resolves late', async () => {
    const first = deferred(), second = deferred();
    const loader = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const app = create(loader);
    const loadFirst = app.load('A', 'A.json');
    const firstSignal = loader.mock.calls[0][1].signal;
    const loadSecond = app.load('B', 'B.json');
    expect(firstSignal.aborted).toBe(true);
    const b = makeData('B'); second.resolve(b);
    expect(await loadSecond).toBe(true);
    first.resolve(makeData('A'));
    expect(await loadFirst).toBe(false);
    expect(app.getState().data).toBe(b);
    expect(viewer.loadFloorData).toHaveBeenCalledTimes(1);
    expect(document.getElementById('file-name-display').textContent).toBe('B.json');
  });

  it('cancels an unresolved source before parsing and preserves a newer selection', async () => {
    const slow = deferred(); let sourceSignal;
    const data = makeData('Current'); const loader = vi.fn(async () => data);
    const app = create(loader);
    const stale = app.load(signal => { sourceSignal = signal; return slow.promise; });
    expect(await app.load('current')).toBe(true);
    expect(sourceSignal.aborted).toBe(true);
    slow.resolve('stale');
    expect(await stale).toBe(false);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(app.getState().data).toBe(data);
  });

  it('rechecks recording before committing a load that began while not recording', async () => {
    const slow = deferred();
    const original = makeData('Original');
    const app = create(vi.fn().mockResolvedValueOnce(original).mockImplementationOnce(() => slow.promise));
    await app.load('original', 'original.json');
    const controller = app.getState().controller;
    controller.setTime(0.025);
    const pending = app.load('next', 'next.json');
    tools.isRecording = () => true;
    slow.resolve(makeData('Replacement'));
    expect(await pending).toBe(false);
    expect(app.getState().data).toBe(original);
    expect(app.getState().controller).toBe(controller);
    expect(controller.getTime()).toBe(0.025);
    expect(viewer.loadFloorData).toHaveBeenCalledTimes(1);
    expect(tools.dispose).not.toHaveBeenCalled();
    expect(document.getElementById('file-name-display').textContent).toBe('original.json');
  });

  it('restores previous geometry, time and file name after geometry construction fails', async () => {
    const a = makeData('A'), b = makeData('B');
    const app = create(vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(b));
    await app.load('a', 'A.json');
    app.getState().controller.setTime(0.025);
    viewer.loadFloorData.mockImplementation(data => { if (data === b) throw new Error('E_GEOMETRY: build failed'); });
    expect(await app.load('b', 'B.json')).toBe(false);
    expect(app.getState().data).toBe(a);
    expect(app.getState().controller.getTime()).toBe(0.025);
    expect(viewer.loadFloorData).toHaveBeenLastCalledWith(a);
    expect(document.getElementById('file-name-display').textContent).toBe('A.json');
  });

  it('stops RAF after damping, coalesces redraw requests and disposes handlers', async () => {
    const app = create(async () => makeData('A'));
    await app.load('a');
    viewer.render.mockReturnValueOnce(true).mockReturnValue(false);
    expect(frames.size).toBe(1);
    flushFrame(); expect(frames.size).toBe(1);
    flushFrame(); expect(frames.size).toBe(0);
    const count = viewer.render.mock.calls.length;
    app.requestRender(); app.requestRender();
    expect(frames.size).toBe(1);
    flushFrame();
    expect(viewer.render).toHaveBeenCalledTimes(count + 1);
    expect(frames.size).toBe(0);
    app.requestRender();
    app.dispose(); application = null;
    expect(frames.size).toBe(0);
    expect(viewer.dispose).toHaveBeenCalledTimes(1);
    const resizeCount = viewer.resize.mock.calls.length;
    window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('click'));
    expect(viewer.resize).toHaveBeenCalledTimes(resizeCount);
    expect(frames.size).toBe(0);
  });

  it('stops playback on hidden tabs and keeps analysis time on return', async () => {
    const app = create(async () => makeData('A'));
    await app.load('a');
    const controller = app.getState().controller;
    controller.setTime(0.02); controller.play();
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(controller.isPlaying()).toBe(false);
    expect(frames.size).toBe(0);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange')); flushFrame();
    expect(controller.getTime()).toBe(0.02);
  });
});

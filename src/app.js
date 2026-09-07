/** Application lifecycle: transactional loading and demand-driven rendering. */
import { loadFloorSource } from './loader.js';
import { AnimationController } from './animation.js';
import { setupUI, disposeUI, updatePlaybackDisplays } from './ui.js';
import { initLang, t, applyTranslations } from './i18n.js';
import { setupShell } from './shell.js';
import { setupAnalysisTools } from './tools-ui.js';
import { STORAGE_KEYS } from './constants.js';

function showMessages(errors = [], warnings = []) {
  const container = document.getElementById('error-container');
  container.replaceChildren();
  if (!errors.length && !warnings.length) return;
  const panel = document.createElement('details');
  panel.className = `message-panel${errors.length ? ' has-errors' : ''}`;
  panel.open = !!errors.length;
  const summary = document.createElement('summary');
  summary.textContent = t(errors.length && warnings.length ? 'messageSummaryBoth' : errors.length ? 'messageSummaryErrors' : 'messageSummaryWarnings', { errors: errors.length, warnings: warnings.length, count: errors.length || warnings.length });
  panel.appendChild(summary);
  for (const [items, cls] of [[errors, 'msg-error'], [warnings, 'msg-warning']]) {
    for (const item of items) { const line = document.createElement('div'); line.className = cls; line.textContent = item.message; panel.appendChild(line); }
  }
  container.appendChild(panel);
}

export function createApplication({ FloorViewer, loader = loadFloorSource, toolsFactory = setupAnalysisTools }) {
  const container = document.getElementById('canvas-container');
  const viewer = new FloorViewer(container);
  const events = new AbortController();
  let controller = null, data = null, frame = 0, timestamp = null, frameKey = '', generation = 0;
  let loading = null, disposed = false, toolsUI = null;
  const on = (target, event, fn) => target.addEventListener(event, fn, { signal: events.signal });
  function setReady(ready) {
    document.body.dataset.ready = String(ready);
    for (const element of document.querySelectorAll('#controls button, #controls input, #controls select')) {
      if (!['btn-select-file', 'file-input', 'btn-lang', 'btn-theme', 'cancel-load'].includes(element.id)) element.disabled = !ready;
    }
  }
  function setStatus(key) {
    document.body.dataset.loadState = key;
    const el = document.getElementById('load-status');
    el.dataset.i18n = key;
    el.textContent = t(key);
    document.getElementById('cancel-load').hidden = key !== 'loadReading' && key !== 'loadParsing' && key !== 'loadValidating';
  }
  function requestRender() {
    if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function updateFrame(force = false) {
    if (!controller) return;
    const key = [controller.getTime(), controller.getCurrentMode(), controller.getScale(), controller.isDisplayNormalized()].join(':');
    if (key !== frameKey || force) {
      const response = controller.getDataKind() === 'response';
      viewer.updateDeformed(id => controller.getDisplacedZ(id), response ? id => controller.getResponseValue(id) : undefined, response ? controller.getResponseRange() : undefined);
      frameKey = key;
    }
    updatePlaybackDisplays(controller, viewer);
    toolsUI?.update();
  }
  function tick(now) {
    frame = 0;
    const delta = timestamp === null ? 0 : Math.max(0, (now - timestamp) / 1000);
    timestamp = now;
    if (!toolsUI?.isRecording()) controller?.update(delta);
    updateFrame();
    const damping = viewer.render();
    if (controller?.isPlaying() || damping) requestRender();
    else timestamp = null;
  }
  function cancelLoad() {
    generation++;
    loading?.abort(); loading = null;
    setStatus(data ? 'loadReady' : 'loadCancelled');
    requestRender();
  }
  async function load(source, name = '') {
    if (toolsUI?.isRecording()) return false;
    const current = ++generation;
    loading?.abort();
    const abort = new AbortController(); loading = abort;
    setStatus('loadReading'); showMessages();
    try {
      const input = typeof source === 'function' ? await source(abort.signal) : source;
      if (abort.signal.aborted) return false;
      const nextData = await loader(input, { signal: abort.signal, onProgress: progress => {
        if (current !== generation) return;
        const stage = typeof progress === 'string' ? progress : progress.stage;
        setStatus(stage === 'validate' || stage === 'validating' ? 'loadValidating' : 'loadParsing');
      } });
      if (disposed || current !== generation) return false;
      const nextController = new AnimationController(nextData);
      const oldTime = controller?.getTime();
      controller?.stop();
      try { viewer.loadFloorData(nextData); } catch (error) {
        if (data) { viewer.loadFloorData(data); controller.setTime(oldTime); frameKey = ''; }
        throw error;
      }
      toolsUI?.dispose();
      controller = nextController; data = nextData; frameKey = ''; timestamp = null;
      setReady(true);
      setupUI({ viewer, animController: controller, floorData: data, beforeCapture: () => updateFrame(true) });
      toolsUI = toolsFactory({ viewer, controller, data, requestRender, beforeCapture: () => updateFrame(true) });
      const display = document.getElementById('file-name-display');
      display.textContent = name || data.meta?.title || ''; display._hasFile = true;
      showMessages([], nextData.validationWarnings || []);
      setStatus('loadReady'); requestRender();
      return true;
    } catch (error) {
      if (current !== generation || disposed) return false;
      setStatus(error.name === 'AbortError' ? 'loadCancelled' : 'loadError');
      if (error.name !== 'AbortError') showMessages(error.issues?.errors || error.errors || [{ code: 'E_DATA_LOAD', message: error.message }], error.issues?.warnings || []);
      requestRender(); return false;
    } finally { if (current === generation) loading = null; }
  }
  const disposeShell = setupShell({ load, cancel: cancelLoad, onChange: () => { viewer.setThemeColors(document.documentElement.dataset.theme === 'dark'); requestRender(); } });
  setReady(false);
  viewer.setRenderRequest(requestRender);
  viewer.setThemeColors(document.documentElement.dataset.theme === 'dark');
  on(window, 'resize', () => { viewer.resize(); toolsUI?.resize(); requestRender(); });
  for (const event of ['click', 'input', 'change', 'keydown', 'toggle']) on(document, event, requestRender);
  on(document, 'visibilitychange', () => {
    if (document.hidden) { controller?.stop(); toolsUI?.cancelRecording(); if (frame) cancelAnimationFrame(frame); frame = 0; timestamp = null; }
    else requestRender();
  });
  function dispose() {
    disposed = true; generation++; loading?.abort();
    if (frame) cancelAnimationFrame(frame);
    toolsUI?.dispose(); disposeUI(); disposeShell(); events.abort(); viewer.dispose();
  }
  on(window, 'pagehide', event => { if (!event.persisted) dispose(); });
  viewer.resize(); requestRender();
  return { load, cancelLoad, dispose, requestRender, getState: () => ({ data, controller, loading: !!loading }) };
}

export async function initApp() {
  initLang(); applyTranslations();
  try { if (localStorage.getItem(STORAGE_KEYS.theme) === 'dark') document.documentElement.dataset.theme = 'dark'; } catch { /* unavailable */ }
  try {
    const { FloorViewer } = await import('./viewer.js');
    const app = createApplication({ FloorViewer });
    await app.load(async signal => Promise.all(['Test0202_calc.yaml', 'Test0202_calc_go_modal_result.json', 'Test0202_manifest.json'].map(async name => {
      const response = await fetch(`${import.meta.env.BASE_URL}Sample/${name}`, { signal });
      if (!response.ok) throw new Error(`E_FETCH: ${name} HTTP ${response.status}`);
      return { name, text: await response.text() };
    })), 'Test0202');
    return app;
  } catch (error) { showMessages([{ code: 'E_WEBGL', message: t('errorWebGL', { msg: error.message }) }]); return null; }
}

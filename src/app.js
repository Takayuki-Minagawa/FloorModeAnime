/** Application lifecycle: transactional loading and demand-driven rendering. */
import { loadFloorSource } from './loader.js';
import { AnimationController } from './animation.js';
import { setupUI, disposeUI, updatePlaybackDisplays } from './ui.js';
import { initLang, setLang, t, applyTranslations, issueHint } from './i18n.js';
import { setupShell } from './shell.js';
import { setupAnalysisTools } from './tools-ui.js';
import { STORAGE_KEYS } from './constants.js';
import { SAMPLE_SETS, parseStartupParams, applyUrlState, createPublicApi } from './automation.js';

export const APP_VERSION = '1.5.0';

/** 直近の診断。言語切替時に同じ内容を再描画するために保持する。 */
let lastMessages = { errors: [], warnings: [] };

function showMessages(errors = [], warnings = []) {
  lastMessages = { errors, warnings };
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
    for (const item of items) {
      const line = document.createElement('div'); line.className = cls; line.textContent = item.message;
      const hint = issueHint(item.message || item.code);
      if (hint) { const span = document.createElement('span'); span.className = 'msg-hint'; span.textContent = hint; line.appendChild(span); }
      panel.appendChild(line);
    }
  }
  container.appendChild(panel);
}

/** 読込済みデータの概要（節点数など）を一行にまとめる。 */
function summarizeData(data) {
  if (!data) return '';
  if (data.dataKind === 'response') {
    return t('loadSummaryResponse', {
      nodes: data.nodes?.size ?? 0, faces: data.faces?.length ?? 0, times: data.response?.times?.length ?? 0,
      quantity: data.response?.quantity ?? '-', unit: data.response?.unit ?? '-',
    });
  }
  return t('loadSummaryMode', {
    nodes: data.nodes?.size ?? 0, lines: data.lines?.length ?? 0, modes: data.modes?.size ?? 0,
    unit: data.meta?.lengthUnit ?? '-',
  });
}

/** 公開サンプル一式を取得する source 関数を返す。 */
function sampleSource(key) {
  const names = SAMPLE_SETS[key];
  if (!names) throw new Error(`E_SAMPLE_UNKNOWN: unknown sample ${key}`);
  return async signal => Promise.all(names.map(async name => {
    const response = await fetch(`${import.meta.env.BASE_URL}Sample/${name}`, { signal });
    if (!response.ok) throw new Error(`E_FETCH: ${name} HTTP ${response.status}`);
    return { name, text: await response.text() };
  }));
}

/** 外部 URL（CORS 許可済み）からファイルを取得する source 関数を返す。 */
function urlSource(urls) {
  return async signal => Promise.all(urls.map(async url => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`E_FETCH: ${url} HTTP ${response.status}`);
    const name = decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || 'input.json');
    return { name, text: await response.text() };
  }));
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
      if (!['btn-select-file', 'file-input', 'btn-lang', 'btn-theme', 'cancel-load', 'sample-select', 'btn-load-sample', 'btn-load-paste'].includes(element.id)) element.disabled = !ready;
    }
  }
  function setStatus(key) {
    document.body.dataset.loadState = key;
    const el = document.getElementById('load-status');
    el.dataset.i18n = key;
    el.textContent = t(key);
    const busy = ['loadReading', 'loadParsing', 'loadValidating'].includes(key);
    document.getElementById('cancel-load').hidden = !busy;
    document.getElementById('save-video').disabled = busy || !controller || !!toolsUI?.isRecording();
    requestRender();
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
    // 自動操作向けに現在状態を body の data-* 属性へ公開する
    const state = document.body.dataset;
    state.playing = String(controller.isPlaying());
    state.dataKind = controller.getDataKind();
    state.mode = String(controller.getCurrentMode() ?? '');
    state.time = controller.getTime().toFixed(6);
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
    setStatus(data ? 'loadCancelledKeep' : 'loadCancelled');
    requestRender();
  }
  async function load(source, name = '') {
    if (toolsUI?.isRecording()) return false;
    const current = ++generation;
    loading?.abort();
    const abort = new AbortController(); loading = abort;
    setStatus('loadReading'); showMessages();
    const display = document.getElementById('file-name-display');
    try {
      let nextData;
      try {
        const input = typeof source === 'function' ? await source(abort.signal) : source;
        if (abort.signal.aborted) return false;
        nextData = await loader(input, { signal: abort.signal, onProgress: progress => {
          if (current !== generation) return;
          const stage = typeof progress === 'string' ? progress : progress.stage;
          setStatus(stage === 'validate' || stage === 'validating' ? 'loadValidating' : 'loadParsing');
        } });
      } catch (error) {
        // 読込・解析の失敗は、失敗したファイル名を表示して状況を分かるようにする
        if (error.name !== 'AbortError' && name && current === generation) { display.textContent = name; display._hasFile = true; }
        throw error;
      }
      if (disposed || current !== generation) return false;
      if (toolsUI?.isRecording()) throw new Error('E_LOAD_RECORDING: cancel recording before replacing data');
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
      display.textContent = name || data.meta?.title || ''; display._hasFile = true;
      document.getElementById('load-summary').textContent = summarizeData(data);
      document.body.dataset.selectedNode = document.getElementById('selected-node')?.value ?? '';
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
  const loadSample = key => load(sampleSource(key), key);
  const disposeShell = setupShell({ load, cancel: cancelLoad, loadSample, onChange: () => { viewer.setThemeColors(document.documentElement.dataset.theme === 'dark'); requestRender(); } });
  setReady(false);
  // 言語切替時は診断パネルと読込概要を現在の言語で描き直す
  on(document, 'floor:langchange', () => {
    showMessages(lastMessages.errors, lastMessages.warnings);
    document.getElementById('load-summary').textContent = summarizeData(data);
    const status = document.getElementById('load-status');
    if (status?.dataset.i18n) status.textContent = t(status.dataset.i18n);
  });
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
  return { load, loadSample, cancelLoad, dispose, requestRender, getState: () => ({ data, controller, loading: !!loading }) };
}

export async function initApp() {
  const params = new URLSearchParams(location.search);
  const startup = parseStartupParams(params);
  initLang();
  if (startup.lang) setLang(startup.lang);
  applyTranslations();
  try { if (localStorage.getItem(STORAGE_KEYS.theme) === 'dark') document.documentElement.dataset.theme = 'dark'; } catch { /* unavailable */ }
  if (startup.theme) document.documentElement.dataset.theme = startup.theme === 'dark' ? 'dark' : '';
  try {
    const { FloorViewer } = await import('./viewer.js');
    const app = createApplication({ FloorViewer });
    window.floorModeAnime = createPublicApi(app, APP_VERSION);
    const loaded = startup.sources.length
      ? await app.load(urlSource(startup.sources), startup.sources.map(url => url.split('/').pop()).join(', '))
      : await app.loadSample(startup.sample ?? 'Test0202');
    if (loaded) applyUrlState(app, params);
    return app;
  } catch (error) { showMessages([{ code: 'E_WEBGL', message: t('errorWebGL', { msg: error.message }) }]); return null; }
}

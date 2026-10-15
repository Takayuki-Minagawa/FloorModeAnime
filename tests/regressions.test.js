// @vitest-environment jsdom
//
// 2026-10 の不具合報告（B1〜B16）と自動操作向け要望（A1〜A8）の回帰テスト。
// three.js/WebGL に依存しないよう viewer はモックを使う。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFloorData } from '../src/parser.js';
import { parseFloorDataSource } from '../src/data/input-source.js';
import { AnimationController } from '../src/animation.js';
import { setupUI, timeDigits, syncPlaybackDisplays } from '../src/ui.js';
import { setupAnalysisTools } from '../src/tools-ui.js';
import { setupComparison } from '../src/compare-ui.js';
import { applyTranslations, initLang, setLang, issueHint, t } from '../src/i18n.js';
import { buildSettings, SETTING_IDS } from '../src/settings.js';
import { createApplication } from '../src/app.js';
import { parseStartupParams, applyUrlState, createPublicApi, snapshotState, SAMPLE_SETS } from '../src/automation.js';
import { FRAME_STEPS } from '../src/constants.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const sample = readFileSync(resolve(root, 'public/Sample/sample_case.json'), 'utf8');
const yamlText = readFileSync(resolve(root, 'public/Sample/Test0202_calc.yaml'), 'utf8');

function loadIndexBody() {
  document.body.innerHTML = html.split('<body>')[1].split('</body>')[0].replace(/<script[\s\S]*?<\/script>/g, '');
}

/** 高周波（40 Hz）のモードデータ。周期 0.025 s なので T/60 ≈ 0.0004 s。 */
function highFrequencyData() {
  const data = parseFloorData(sample);
  data.freqHz = new Map([[1, 40], [2, 8.7]]);
  return data;
}

function makeViewer() {
  return {
    setVisibility: vi.fn(), setLineStyle: vi.fn(), setThemeColors: vi.fn(), setView: vi.fn(),
    setHighlightNode: vi.fn(), setModeColoring: vi.fn(), setSelectedNode: vi.fn(), onNodeSelect: vi.fn(),
    setFrameMetadata: vi.fn(), resize: vi.fn(), setViewState: vi.fn(), setEnvelope: vi.fn(),
    getLineColors: vi.fn(() => ({ undeformedColor: '#888888', deformedColor: '#ff4444' })),
    getViewState: () => ({ position: [4, 4, 4], target: [0, 0, 0], up: [0, 1, 0], zoom: 1 }),
    savePNG: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.lang = 'ja';
  localStorage.clear();
  setLang('ja');
  loadIndexBody();
});

describe('B3: single-file input classification', () => {
  it('rejects a lone YAML model with E_FILE_PAIR instead of a JSON parse error', () => {
    expect(() => parseFloorDataSource([{ name: 'Test0202_calc.yaml', text: yamlText }])).toThrow(/^E_FILE_PAIR/);
  });

  it('prefixes JSON failures with E_JSON_PARSE', () => {
    expect(() => parseFloorDataSource([{ name: 'broken.json', text: '{broken' }])).toThrow(/^E_JSON_PARSE/);
  });
});

describe('B15: localized hints for diagnostic codes', () => {
  it('returns a Japanese or English hint by current language and empty for unknown codes', () => {
    setLang('ja');
    expect(issueHint('W_FREQ_HIGH: freqHz[2]=39.5 > 30 Hz may reduce visual clarity')).toContain('モード観察用再生');
    setLang('en');
    expect(issueHint('W_FREQ_HIGH: x')).toContain('observation playback');
    expect(issueHint('E_UNKNOWN_CODE: x')).toBe('');
    expect(issueHint('no code here')).toBe('');
  });
});

describe('B6: time display resolution and frame counter', () => {
  it('keeps three decimals for low-frequency modes and widens for short periods', () => {
    expect(timeDigits(new AnimationController(parseFloorData(sample)))).toBe(3);
    expect(timeDigits(new AnimationController(highFrequencyData()))).toBe(4);
    expect(timeDigits(null)).toBe(3);
  });

  it('shows a distinguishable time and frame index after one step on a 40 Hz mode', () => {
    const animController = new AnimationController(highFrequencyData());
    setupUI({ viewer: makeViewer(), animController, floorData: highFrequencyData() });
    expect(document.getElementById('frame-display').textContent).toBe(t('frameDisplay', { k: 0, n: FRAME_STEPS }));
    document.getElementById('btn-step-fwd').click();
    expect(document.getElementById('time-display').textContent).toBe('t = 0.0004 s');
    expect(document.getElementById('frame-display').textContent).toBe(t('frameDisplay', { k: 1, n: FRAME_STEPS }));
    expect(document.getElementById('time-slider').getAttribute('aria-valuetext')).toBe('t = 0.0004 s');
  });
});

describe('B10 / A6: numeric inputs and accessible names', () => {
  it('writes the slider value back when the number box receives a non-numeric value', () => {
    const floorData = parseFloorData(sample);
    setupUI({ viewer: makeViewer(), animController: new AnimationController(floorData), floorData });
    const number = document.getElementById('speed-number');
    const slider = document.getElementById('speed-slider');
    number.value = '1.5'; number.dispatchEvent(new Event('change'));
    expect(slider.value).toBe('1.5');
    number.value = ''; number.dispatchEvent(new Event('change'));
    expect(number.value).toBe('1.5');
    expect(slider.getAttribute('aria-valuetext')).toBe('1.5');
  });

  it('gives every control in the panel an accessible name after translation', () => {
    applyTranslations();
    const unnamed = [...document.querySelectorAll('#controls input, #controls select, #controls button, #controls textarea')]
      .filter(el => !el.hidden)
      .filter(el => !(document.querySelector(`label[for="${el.id}"]`) || el.closest('label') || el.getAttribute('aria-label') || el.title || (el.tagName === 'BUTTON' && el.textContent.trim())))
      .map(el => el.id);
    expect(unnamed).toEqual([]);
  });
});

describe('B4: theme and language buttons both show the target state', () => {
  it('labels the theme button with the target theme and exposes aria-pressed', () => {
    const floorData = parseFloorData(sample);
    setupUI({ viewer: makeViewer(), animController: new AnimationController(floorData), floorData });
    const button = document.getElementById('btn-theme');
    expect(button.textContent).toBe(t('btnThemeToDark'));
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(button.textContent).toBe(t('btnThemeToLight'));
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('screening shows an explicit "none" result', () => {
  it('prints habNone for a mode outside the walking bands', () => {
    const data = highFrequencyData();
    setupUI({ viewer: makeViewer(), animController: new AnimationController(data), floorData: data });
    const el = document.getElementById('habitability-display');
    expect(el.textContent).toBe(t('habNone'));
    expect(el.dataset.risk).toBe('low');
  });
});

describe('B1 / B11 / B12: analysis tools', () => {
  let viewer, controller, data, tools;
  beforeEach(() => {
    viewer = makeViewer();
    data = highFrequencyData();
    controller = new AnimationController(data);
    setupUI({ viewer, animController: controller, floorData: data });
    tools = setupAnalysisTools({ viewer, controller, data, requestRender: vi.fn(), beforeCapture: vi.fn() });
  });
  afterEach(() => tools.dispose());

  it('restores the timeline slider together with the time from a settings JSON', async () => {
    const period = controller.getPeriod();
    const controls = Object.fromEntries(SETTING_IDS.map(id => { const el = document.getElementById(id); return [id, el.type === 'checkbox' ? el.checked : el.value]; }));
    const state = buildSettings(data, controller, viewer, 2, controls);
    state.time = period / 4; state.mode = 2;
    const input = document.getElementById('settings-file');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([JSON.stringify(state)], 'settings.json', { type: 'application/json' })] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(controller.getTime()).toBeCloseTo(period / 4, 9));
    expect(document.getElementById('mode-select').value).toBe('2');
    expect(Number(document.getElementById('time-slider').value)).toBeCloseTo(controller.getTime(), 9);
    expect(document.getElementById('time-display').textContent).toBe(`t = ${controller.getTime().toFixed(timeDigits(controller))} s`);
    expect(document.body.dataset.selectedNode).toBe('2');
  });

  it('syncPlaybackDisplays moves the slider for a modal seek outside the UI', () => {
    controller.setTime(0.01);
    syncPlaybackDisplays(controller);
    expect(Number(document.getElementById('time-slider').value)).toBeCloseTo(0.01, 9);
  });

  it('resets an invalid node ID to the current selection and explains the error', () => {
    const input = document.getElementById('selected-node');
    input.value = '9999'; input.dispatchEvent(new Event('change'));
    expect(input.value).toBe('1');
    expect(document.getElementById('tools-error').textContent).toContain('E_NODE_SELECT');
    expect(document.getElementById('tools-error').textContent).toContain(issueHint('E_NODE_SELECT'));
    input.value = '3'; input.dispatchEvent(new Event('change'));
    expect(document.getElementById('tools-error').textContent).toBe('');
    expect(document.body.dataset.selectedNode).toBe('3');
  });

  it('uses a video-specific message when recording is requested during playback', () => {
    controller.play();
    document.getElementById('save-video').click();
    expect(document.getElementById('tools-error').textContent).toContain(t('alertVideoStop'));
    controller.stop();
  });

  it('closing a case comparison clears the sign inversion checkbox', () => {
    const events = new AbortController();
    const comparison = setupComparison({ viewer, controller, data, on: (el, ev, fn) => el.addEventListener(ev, fn, { signal: events.signal }), requestRender: vi.fn(), error: vi.fn() });
    document.getElementById('compare-sign').checked = true;
    document.getElementById('clear-compare').click();
    expect(document.getElementById('compare-sign').checked).toBe(false);
    comparison.dispose(); events.abort();
  });
});

describe('B8: PNG errors are shown inline instead of alert()', () => {
  it('writes the stop-first message to #tools-error while playing', async () => {
    const floorData = parseFloorData(sample);
    const animController = new AnimationController(floorData);
    const viewer = makeViewer();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    setupUI({ viewer, animController, floorData });
    animController.play();
    document.getElementById('btn-download').click();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(viewer.savePNG).not.toHaveBeenCalled();
    expect(document.getElementById('tools-error').textContent).toBe(t('alertPngStop'));
    animController.stop();
    document.getElementById('btn-download').click();
    await vi.waitFor(() => expect(viewer.savePNG).toHaveBeenCalled());
    expect(document.getElementById('tools-error').textContent).toBe('');
    alertSpy.mockRestore();
  });
});

describe('application: messages, summary, cancel, failed names, URL state and public API', () => {
  let frames, clock, nextId, application;
  class MockViewer {
    constructor() {
      Object.assign(this, makeViewer());
      for (const method of ['setRenderRequest', 'dispose', 'loadFloorData', 'updateDeformed']) this[method] = vi.fn();
      this.render = vi.fn(() => false);
    }
  }
  const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
  beforeEach(() => {
    frames = new Map(); clock = 0; nextId = 1;
    vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { const id = nextId++; frames.set(id, callback); return id; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn(id => frames.delete(id)));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    initLang(); applyTranslations();
  });
  afterEach(() => { application?.dispose(); application = null; vi.unstubAllGlobals(); });
  const flushFrame = () => { const pending = [...frames.values()]; frames.clear(); clock += 16; for (const callback of pending) callback(clock); };
  const dataWithWarning = () => { const data = parseFloorData(sample); data.validationWarnings = [{ code: 'W_FREQ_HIGH', message: 'W_FREQ_HIGH: freqHz[1]=40 > 30 Hz may reduce visual clarity' }]; return data; };

  it('re-renders warnings with hints in the new language and shows a load summary', async () => {
    application = createApplication({ FloorViewer: MockViewer, loader: vi.fn(async () => dataWithWarning()) });
    expect(await application.load('x', 'case.json')).toBe(true);
    const container = document.getElementById('error-container');
    expect(container.querySelector('summary').textContent).toBe(t('messageSummaryWarnings', { count: 1 }));
    expect(container.querySelector('.msg-hint').textContent).toContain('モード観察用再生');
    expect(document.getElementById('load-summary').textContent).toBe(t('loadSummaryMode', { nodes: 4, lines: 4, modes: 2, unit: 'm' }));
    document.getElementById('btn-lang').click();
    expect(document.documentElement.lang).toBe('en');
    expect(container.querySelector('summary').textContent).toBe('1 warning(s) - click for details');
    expect(container.querySelector('.msg-hint').textContent).toContain('observation playback');
    expect(document.getElementById('load-summary').textContent).toContain('4 nodes');
  });

  it('reports a cancel that keeps the previous data, and names a file that failed to load', async () => {
    const slow = deferred();
    const loader = vi.fn().mockResolvedValueOnce(parseFloorData(sample)).mockImplementationOnce(() => slow.promise).mockRejectedValueOnce(new Error('E_JSON_PARSE: broken'));
    application = createApplication({ FloorViewer: MockViewer, loader });
    expect(await application.load('ok', 'ok.json')).toBe(true);
    const pending = application.load('slow', 'slow.json');
    application.cancelLoad();
    slow.resolve(parseFloorData(sample));
    expect(await pending).toBe(false);
    expect(document.body.dataset.loadState).toBe('loadCancelledKeep');
    expect(document.getElementById('load-status').textContent).toBe(t('loadCancelledKeep'));
    expect(application.getState().data).toBeTruthy();
    expect(await application.load('bad', 'bad.json')).toBe(false);
    expect(document.body.dataset.loadState).toBe('loadError');
    expect(document.getElementById('file-name-display').textContent).toBe('bad.json');
    expect(document.getElementById('error-container').textContent).toContain(issueHint('E_JSON_PARSE'));
  });

  it('applies URL state after load and exposes a public API driven through the UI', async () => {
    application = createApplication({ FloorViewer: MockViewer, loader: vi.fn(async () => parseFloorData(sample)) });
    expect(await application.load('x', 'case.json')).toBe(true);
    const controller = application.getState().controller;
    const viewer = application.getState() && document.querySelector('#canvas-container') && null;
    void viewer;
    applyUrlState(application, new URLSearchParams('mode=2&t=0.01&view=top&node=3&scale=2&speed=0.5&obs=2&bogus=1'));
    expect(controller.getCurrentMode()).toBe(2);
    expect(controller.getTime()).toBeCloseTo(0.01, 9);
    expect(Number(document.getElementById('time-slider').value)).toBeCloseTo(0.01, 9);
    expect(controller.getScale()).toBeCloseTo(2, 9);
    expect(controller.getSpeed()).toBeCloseTo(0.5, 9);
    expect(controller.getObservationPeriod()).toBe(2);
    expect(document.body.dataset.selectedNode).toBe('3');
    flushFrame();
    expect(document.body.dataset.mode).toBe('2');
    expect(document.body.dataset.playing).toBe('false');
    expect(document.body.dataset.dataKind).toBe('mode');

    const api = createPublicApi(application, '1.5.0');
    expect(api.samples).toEqual(Object.keys(SAMPLE_SETS));
    expect(api.setMode(1)).toBe(true);
    expect(api.setMode(99)).toBe(false);
    expect(controller.getCurrentMode()).toBe(1);
    expect(api.setTime(0.02)).toBe(true);
    expect(controller.getTime()).toBeCloseTo(0.02, 9);
    expect(api.selectNode(4)).toBe(true);
    expect(api.selectNode(999)).toBe(false);
    api.play(); flushFrame();
    expect(api.getState().playing).toBe(true);
    api.stop(); flushFrame();
    const state = api.getState();
    expect(state).toMatchObject({ ready: true, loadState: 'loadReady', dataKind: 'mode', mode: 1, playing: false, selectedNode: 4, nodeCount: 4, lang: 'ja', theme: 'light' });
    expect(state.modes).toEqual([1, 2]);
    expect(snapshotState({ getState: () => ({ data: null, controller: null, loading: false }) }).dataKind).toBeNull();
  });

  it('parses startup parameters defensively', () => {
    expect(parseStartupParams(new URLSearchParams('lang=en&theme=dark&sample=response_case&src=a.json,%20b.yaml'))).toEqual({ lang: 'en', theme: 'dark', sample: 'response_case', sources: ['a.json', 'b.yaml'] });
    expect(parseStartupParams(new URLSearchParams('lang=fr&theme=blue&sample=../etc'))).toEqual({ lang: null, theme: null, sample: null, sources: [] });
  });
});

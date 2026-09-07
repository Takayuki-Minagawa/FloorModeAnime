// @vitest-environment jsdom
//
// UI 統合テスト: 実際の index.html に対して setupUI を実行し、
// DOM ID の不整合や配線エラー（要素が無くて throw する等）を検出する。
// three.js/WebGL に依存しないよう viewer はモックを使う。

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { parseFloorData } from '../src/parser.js';
import { AnimationController } from '../src/animation.js';
import { setupUI, updatePlaybackDisplays } from '../src/ui.js';
import { applyTranslations, initLang, setLang } from '../src/i18n.js';
import { STORAGE_KEYS, THEME } from '../src/constants.js';
import { buildSettings, validateSettings, SETTING_IDS } from '../src/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** index.html の <body> 内容を取り出して document に流し込む（script は除外）。 */
function loadIndexBody() {
  const html = readFileSync(resolve(root, 'index.html'), 'utf-8');
  const body = html.split('<body>')[1].split('</body>')[0];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, '');
}

/** setupUI が要求する FloorViewer のモック。 */
function makeViewerMock() {
  return {
    setVisibility: vi.fn(),
    getLineColors: vi.fn(() => ({ undeformedColor: '#888888', deformedColor: '#ff4444' })),
    setLineStyle: vi.fn(),
    setThemeColors: vi.fn(),
    setView: vi.fn(),
    setHighlightNode: vi.fn(),
    savePNG: vi.fn(() => Promise.resolve()),
  };
}

const sample = readFileSync(resolve(root, 'public/Sample/sample_case.json'), 'utf-8');
const responseSample = readFileSync(resolve(root, 'public/Sample/response_case.json'), 'utf-8');

describe('UI integration (setupUI against real index.html)', () => {
  let viewer;
  let animController;
  let floorData;

  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
    setLang('ja');
    loadIndexBody();
    floorData = parseFloorData(sample);
    animController = new AnimationController(floorData);
    viewer = makeViewerMock();
  });

  it.each(['mode', 'response'])('theme colors and custom colors survive a saved-settings roundtrip (%s)', kind => {
    if (kind === 'response') {
      floorData = parseFloorData(responseSample);
      animController = new AnimationController(floorData);
    }
    const toHex = value => `#${value.toString(16).padStart(6, '0')}`;
    let dark = false;
    const overrides = {};
    viewer.getLineColors.mockImplementation(() => {
      const theme = dark ? THEME.dark : THEME.light;
      return {
        undeformedColor: overrides.undeformedColor ?? toHex(theme.undeformed),
        deformedColor: overrides.deformedColor ?? toHex(kind === 'response' ? theme.response : theme.deformed),
      };
    });
    viewer.setThemeColors.mockImplementation(value => { dark = value; });
    viewer.setLineStyle.mockImplementation(style => Object.assign(overrides, style));
    viewer.getViewState = () => ({ position: [4, 4, 4], target: [0, 0, 0], up: [0, 1, 0], zoom: 1 });
    setupUI({ viewer, animController, floorData });
    const undeformed = document.getElementById('color-undeformed');
    const deformed = document.getElementById('color-deformed');
    undeformed.value = '#123456';
    undeformed.dispatchEvent(new Event('input'));
    document.getElementById('btn-theme').click();
    const savedColors = viewer.getLineColors();
    expect(undeformed.value).toBe('#123456');
    expect(deformed.value).toBe(toHex(kind === 'response' ? THEME.dark.response : THEME.dark.deformed));
    const controls = Object.fromEntries(SETTING_IDS.map(id => {
      const element = document.getElementById(id);
      return [id, element.type === 'checkbox' ? element.checked : element.value];
    }));
    const saved = validateSettings(JSON.parse(JSON.stringify(buildSettings(floorData, animController, viewer, 1, controls))), floorData);
    expect(saved.controls['color-undeformed']).toBe(savedColors.undeformedColor);
    expect(saved.controls['color-deformed']).toBe(savedColors.deformedColor);
    document.getElementById('btn-theme').click();
    expect(deformed.value).toBe(toHex(kind === 'response' ? THEME.light.response : THEME.light.deformed));
    for (const id of ['color-undeformed', 'color-deformed']) {
      const element = document.getElementById(id);
      element.value = saved.controls[id];
      element.dispatchEvent(new Event('input'));
    }
    expect(viewer.getLineColors()).toEqual(savedColors);
  });

  it('setupUI が例外なく完了し、初期表示を構築する', () => {
    expect(() =>
      setupUI({ viewer, animController, floorData, onFileLoad: () => {} }),
    ).not.toThrow();

    // モード選択が populate される
    const modeSelect = document.getElementById('mode-select');
    expect(modeSelect.options.length).toBe(animController.getModeList().length);

    // 初期表示で visibility が適用される
    expect(viewer.setVisibility).toHaveBeenCalled();

    // モード形テーブルが構築される（節点数ぶんの行）
    const rows = document.querySelectorAll('#modeshape-table table.modeshape tbody tr');
    expect(rows.length).toBe(animController.getNodeIds().length);

    // タイムラインの max が現モードの周期に設定される
    const slider = document.getElementById('time-slider');
    expect(parseFloat(slider.max)).toBeCloseTo(animController.getPeriod(), 6);
  });

  it('視点プリセットボタンが viewer.setView を呼ぶ', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    document.getElementById('btn-view-top').click();
    expect(viewer.setView).toHaveBeenCalledWith('top');
  });

  it('最大変位チェックで viewer.setHighlightNode が最大節点で呼ばれる', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    const chk = document.getElementById('chk-highlight');
    chk.checked = true;
    chk.dispatchEvent(new window.Event('change'));
    expect(viewer.setHighlightNode).toHaveBeenLastCalledWith(animController.getMaxNode());
  });

  it('タイムラインのスクラブで停止し、setTime が反映される', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    animController.play();
    const slider = document.getElementById('time-slider');
    slider.value = String(animController.getPeriod() / 2);
    slider.dispatchEvent(new window.Event('input'));
    expect(animController.isPlaying()).toBe(false);
    expect(animController.getTime()).toBeCloseTo(animController.getPeriod() / 2, 6);
  });

  it('再生後にスクラブすると節点ラベル表示が復帰する（applyVisibility 再評価）', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    // 再生中は labels:false で表示が更新される
    animController.play();
    document.getElementById('btn-play').click();
    // スクラブで停止 → labels が再評価され true に戻る
    viewer.setVisibility.mockClear();
    const slider = document.getElementById('time-slider');
    slider.value = String(animController.getPeriod() / 2);
    slider.dispatchEvent(new window.Event('input'));
    expect(animController.isPlaying()).toBe(false);
    const lastCall = viewer.setVisibility.mock.calls.at(-1)[0];
    expect(lastCall.labels).toBe(true);
  });

  it('数値入力ボックスがスライダーと同期し倍率に反映される', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    const num = document.getElementById('scale-number');
    num.value = '2.5';
    num.dispatchEvent(new window.Event('change'));
    const slider = document.getElementById('scale-slider');
    expect(parseFloat(slider.value)).toBeCloseTo(2.5, 6);
  });

  it('保存済みテーマのDOM状態にボタン文言を同期する', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    expect(document.getElementById('btn-theme').textContent).toContain('ダーク');
  });

  it('保存済み言語の再読込時に言語切替ボタンも同期する', () => {
    localStorage.setItem(STORAGE_KEYS.lang, 'en');
    initLang();
    applyTranslations();
    expect(document.getElementById('btn-lang').textContent).toBe('JA');
  });

  it('Space キーで再生/停止がトグルする', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    expect(animController.isPlaying()).toBe(false);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ' }));
    expect(animController.isPlaying()).toBe(true);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ' }));
    expect(animController.isPlaying()).toBe(false);
  });

  it('updatePlaybackDisplays が再生中にタイムライン位置を更新する', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    animController.play();
    animController.setTime(animController.getPeriod() / 4);
    updatePlaybackDisplays(animController);
    const slider = document.getElementById('time-slider');
    expect(parseFloat(slider.value)).toBeCloseTo(animController.getPeriod() / 4, 6);
  });

  it('応答archiveの終端自動停止で節点ラベルを復帰する', () => {
    floorData = parseFloorData(responseSample);
    animController = new AnimationController(floorData);
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    viewer.setVisibility.mockClear();

    updatePlaybackDisplays(animController, viewer);
    animController.play();
    updatePlaybackDisplays(animController, viewer);
    animController.update(10);
    updatePlaybackDisplays(animController, viewer);

    expect(animController.isPlaying()).toBe(false);
    expect(viewer.setVisibility).toHaveBeenLastCalledWith({ labels: true });
  });

  it('物理応答archiveではモードUIを分離し、正規化OFFをcontrollerへ反映する', () => {
    floorData = parseFloorData(responseSample);
    animController = new AnimationController(floorData);
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });

    expect(document.getElementById('modal-controls').hidden).toBe(true);
    expect(document.getElementById('response-info').hidden).toBe(false);
    expect(document.getElementById('response-legend').hidden).toBe(false);
    expect(document.getElementById('response-unit').textContent).toContain('m/s^2');
    expect(document.getElementById('response-legend-min').textContent).toBe('-0.1100');
    expect(document.getElementById('response-legend-max').textContent).toBe('0.1100');

    const checkbox = document.getElementById('chk-response-normalization');
    checkbox.checked = false;
    checkbox.dispatchEvent(new window.Event('change'));
    expect(animController.isDisplayNormalized()).toBe(false);
    expect(document.getElementById('scale-slider').disabled).toBe(true);
    expect(document.getElementById('display-meaning').textContent).toContain('archive実値');
  });

  it('読込成功後のUI再初期化でも選択ファイル名を保持する', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    const display = document.getElementById('file-name-display');
    display.textContent = 'response_case.json';
    display._hasFile = true;

    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });

    expect(display.textContent).toBe('response_case.json');
    expect(display._hasFile).toBe(true);
  });
});

describe('state synchronization regressions', () => {
  it('preserves stopped modal time and timeline when changing language', () => {
    loadIndexBody(); setLang('ja');
    const data = parseFloorData(sample), controller = new AnimationController(data), viewer = makeViewerMock();
    setupUI({ viewer, animController: controller, floorData: data });
    const slider = document.getElementById('time-slider');
    slider.value = String(controller.getPeriod() / 4); slider.dispatchEvent(new window.Event('input'));
    const before = controller.getTime();
    document.getElementById('btn-lang').click(); updatePlaybackDisplays(controller, viewer);
    expect(controller.getTime()).toBe(before);
    expect(Number(slider.value)).toBeCloseTo(before, 10);
  });

  it('updates the response maximum marker when the maximum moves to another node', () => {
    loadIndexBody();
    const raw = JSON.parse(responseSample);
    raw.response_values = raw.time_s.map((_, i) => raw.node_order.map((__, j) => j === i % raw.node_order.length ? 1 : 0));
    const data = parseFloorData(JSON.stringify(raw)), controller = new AnimationController(data), viewer = makeViewerMock();
    setupUI({ viewer, animController: controller, floorData: data });
    const checkbox = document.getElementById('chk-highlight'); checkbox.checked = true; checkbox.dispatchEvent(new window.Event('change'));
    controller.setTime(raw.time_s[1]); updatePlaybackDisplays(controller, viewer);
    expect(viewer.setHighlightNode).toHaveBeenLastCalledWith(raw.node_order[1]);
  });
});

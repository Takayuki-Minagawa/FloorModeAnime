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

describe('UI integration (setupUI against real index.html)', () => {
  let viewer;
  let animController;
  let floorData;

  beforeEach(() => {
    loadIndexBody();
    floorData = parseFloorData(sample);
    animController = new AnimationController(floorData);
    viewer = makeViewerMock();
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

  it('数値入力ボックスがスライダーと同期し倍率に反映される', () => {
    setupUI({ viewer, animController, floorData, onFileLoad: () => {} });
    const num = document.getElementById('scale-number');
    num.value = '2.5';
    num.dispatchEvent(new window.Event('change'));
    const slider = document.getElementById('scale-slider');
    expect(parseFloat(slider.value)).toBeCloseTo(2.5, 6);
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
});

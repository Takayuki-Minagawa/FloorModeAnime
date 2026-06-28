/**
 * app.js -- 初期化・モジュール結合
 *
 * @module app
 */

import { parseFloorDataSource } from './parser.js';
import { validateFloorData } from './validator.js';
import { FloorViewer } from './viewer.js';
import { AnimationController } from './animation.js';
import { setupUI, updatePlaybackDisplays } from './ui.js';
import { initLang, t, applyTranslations } from './i18n.js';
import { DOM_IDS, STORAGE_KEYS } from './constants.js';

/** @type {FloorViewer|null} */
let viewer = null;

/** @type {AnimationController|null} */
let animController = null;

/** @type {number} */
let prevTimestamp = 0;

/** @type {number} */
let rafId = 0;

/**
 * エラー・警告を #error-container に表示する。
 * @param {Array<{code:string,message:string}>} errors
 * @param {Array<{code:string,message:string}>} warnings
 */
function showMessages(errors, warnings) {
  const container = document.getElementById(DOM_IDS.errorContainer);
  if (!container) return;
  container.innerHTML = '';

  const errorCount = errors.length;
  const warningCount = warnings.length;
  if (errorCount === 0 && warningCount === 0) return;

  const panel = document.createElement('details');
  panel.className = `message-panel${errorCount > 0 ? ' has-errors' : ''}`;
  panel.open = errorCount > 0;

  const summary = document.createElement('summary');
  summary.className = 'message-summary';
  if (errorCount > 0 && warningCount > 0) {
    summary.textContent = t('messageSummaryBoth', { errors: errorCount, warnings: warningCount });
  } else if (errorCount > 0) {
    summary.textContent = t('messageSummaryErrors', { count: errorCount });
  } else {
    summary.textContent = t('messageSummaryWarnings', { count: warningCount });
  }
  panel.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'message-list';

  const append = (cls, message) => {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = message;
    list.appendChild(div);
  };

  errors.forEach((e) => append('msg-error', e.message));
  warnings.forEach((w) => append('msg-warning', w.message));
  panel.appendChild(list);
  container.appendChild(panel);
}

/**
 * #error-container をクリアする。
 */
function clearMessages() {
  const container = document.getElementById(DOM_IDS.errorContainer);
  if (container) container.innerHTML = '';
}

/**
 * 入力データから床モード標準形を読み込み、シーンを構築する。
 * viewer が既に存在している前提。
 *
 * @param {string|Array<{name:string,text:string}>} source  単一 JSON または calc/result ファイル群
 * @returns {boolean} 成功したら true
 */
function loadData(source) {
  clearMessages();

  // パース
  let data;
  try {
    data = parseFloorDataSource(source);
  } catch (err) {
    showMessages(
      [{ code: 'E_DATA_PARSE', message: t('errorDataParse', { msg: err.message }) }],
      [],
    );
    return false;
  }

  // バリデーション
  const { errors, warnings } = validateFloorData(data);
  if (errors.length > 0) {
    showMessages(errors, warnings);
    return false;
  }
  if (warnings.length > 0) {
    showMessages([], warnings);
  }

  // 既存アニメーションループを停止
  stopAnimationLoop();

  // シーン構築
  viewer.loadFloorData(data);

  // アニメーションコントローラ初期化
  animController = new AnimationController(data);

  // UI 再初期化
  setupUI({
    viewer,
    animController,
    floorData: data,
    onFileLoad: handleFileLoad,
  });

  // 初回描画（アニメーションループ開始前にレンダリング）
  viewer.updateDeformed((id) => animController.getDisplacedZ(id));
  viewer.render();

  // アニメーションループ開始
  startAnimationLoop();

  return true;
}

/**
 * アニメーションループを開始する（既存ループがあれば張り替える）。
 */
function startAnimationLoop() {
  stopAnimationLoop();
  prevTimestamp = 0;
  rafId = requestAnimationFrame(animationLoop);
}

/**
 * 実行中のアニメーションループを停止する。
 */
function stopAnimationLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

/**
 * ファイル読込コールバック。
 * @param {string|Array<{name:string,text:string}>} source
 */
function handleFileLoad(source) {
  loadData(source);
}

/**
 * requestAnimationFrame ループ。
 * @param {DOMHighResTimeStamp} timestamp
 */
function animationLoop(timestamp) {
  rafId = requestAnimationFrame(animationLoop);

  // delta 計算 (秒)
  if (prevTimestamp === 0) {
    prevTimestamp = timestamp;
  }
  const delta = (timestamp - prevTimestamp) / 1000;
  prevTimestamp = timestamp;

  if (!animController || !viewer) return;

  // アニメーション更新
  animController.update(delta);

  // 変形線更新
  viewer.updateDeformed((id) => animController.getDisplacedZ(id));

  // 描画
  viewer.render();

  // 時間表示・タイムライン追従
  updatePlaybackDisplays(animController);
}

/**
 * アプリケーション初期化。
 * DOMContentLoaded から呼ばれる。
 */
export async function initApp() {
  // 言語初期化
  initLang();
  applyTranslations();

  const canvasContainer = document.getElementById(DOM_IDS.canvasContainer);

  // FloorViewer 初期化
  try {
    viewer = new FloorViewer(canvasContainer);
  } catch (err) {
    console.error('FloorViewer init failed:', err);
    showMessages(
      [{ code: 'E_WEBGL', message: t('errorWebGL', { msg: err.message }) }],
      [],
    );
    return;
  }

  // 初期リサイズ（CSS レイアウト完了後のサイズに合わせる）
  viewer.resize();

  // 保存済みテーマの復元
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    viewer.setThemeColors(true);
  }

  // ウィンドウリサイズ対応
  window.addEventListener('resize', () => {
    if (viewer) viewer.resize();
  });

  // サンプル calc/result 自動読込
  let loaded = false;
  try {
    const [modelRes, resultRes] = await Promise.all([
      fetch('Sample/Test0202_calc.yaml'),
      fetch('Sample/Test0202_calc_go_modal_result.json'),
    ]);
    if (!modelRes.ok) throw new Error(`model HTTP ${modelRes.status}`);
    if (!resultRes.ok) throw new Error(`result HTTP ${resultRes.status}`);
    const [modelText, resultText] = await Promise.all([modelRes.text(), resultRes.text()]);
    loaded = loadData([
      { name: 'Test0202_calc.yaml', text: modelText },
      { name: 'Test0202_calc_go_modal_result.json', text: resultText },
    ]);
  } catch (err) {
    console.error('Sample data load failed:', err);
    showMessages(
      [{ code: 'E_FETCH', message: t('errorFetch', { msg: err.message }) }],
      [],
    );
  }

  // サンプル読込失敗・バリデーションエラー時でも viewer は動かしておく
  // （loadData 成功時は内部でループ開始済み）
  if (!loaded) {
    startAnimationLoop();
  }
}

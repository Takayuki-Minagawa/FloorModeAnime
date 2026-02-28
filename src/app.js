/**
 * app.js -- 初期化・モジュール結合
 *
 * @module app
 */

import { parseFloorData } from './parser.js';
import { validateFloorData } from './validator.js';
import { FloorViewer } from './viewer.js';
import { AnimationController } from './animation.js';
import { setupUI, updateTimeDisplay } from './ui.js';
import { initLang, t, applyTranslations } from './i18n.js';

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
  const container = document.getElementById('error-container');
  container.innerHTML = '';

  for (const w of warnings) {
    const div = document.createElement('div');
    div.className = 'msg-warning';
    div.textContent = w.message;
    container.appendChild(div);
  }

  for (const e of errors) {
    const div = document.createElement('div');
    div.className = 'msg-error';
    div.textContent = e.message;
    container.appendChild(div);
  }
}

/**
 * #error-container をクリアする。
 */
function clearMessages() {
  document.getElementById('error-container').innerHTML = '';
}

/**
 * JSON 文字列からデータを読み込み、シーンを構築する。
 * viewer が既に存在している前提。
 *
 * @param {string} jsonText  JSON 文字列
 * @returns {boolean} 成功したら true
 */
function loadData(jsonText) {
  clearMessages();

  // パース
  let data;
  try {
    data = parseFloorData(jsonText);
  } catch (err) {
    showMessages(
      [{ code: 'E_JSON_PARSE', message: t('errorJsonParse', { msg: err.message }) }],
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
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

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
  prevTimestamp = 0;
  rafId = requestAnimationFrame(animationLoop);

  return true;
}

/**
 * ファイル読込コールバック。
 * @param {string} jsonText
 */
function handleFileLoad(jsonText) {
  loadData(jsonText);
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

  // 時間表示
  updateTimeDisplay(animController.getTime());
}

/**
 * アプリケーション初期化。
 * DOMContentLoaded から呼ばれる。
 */
export async function initApp() {
  // 言語初期化
  initLang();
  applyTranslations();

  const canvasContainer = document.getElementById('canvas-container');

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
  const savedTheme = localStorage.getItem('floor-mode-theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    viewer.setThemeColors(true);
  }

  // ウィンドウリサイズ対応
  window.addEventListener('resize', () => {
    if (viewer) viewer.resize();
  });

  // サンプル JSON 自動読込
  try {
    const res = await fetch('Sample/sample_case.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const jsonText = await res.text();
    loadData(jsonText);
  } catch (err) {
    console.error('Sample data load failed:', err);
    showMessages(
      [{ code: 'E_FETCH', message: t('errorFetch', { msg: err.message }) }],
      [],
    );
    // サンプル読込失敗でも viewer は動かしておく
    prevTimestamp = 0;
    rafId = requestAnimationFrame(animationLoop);
  }
}

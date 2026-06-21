/**
 * ui.js -- UIコントロール・イベント管理
 *
 * setupUI を責務ごとのセクション関数へ分割し、各セクションは
 * DOM_IDS と共通ヘルパー（replaceListener / wireSlider）を介して配線する。
 *
 * @module ui
 */

import { t, setLang, getLang, applyTranslations } from './i18n.js';
import { DOM_IDS, SCALE, SPEED, STORAGE_KEYS } from './constants.js';

/** getElementById の短縮 */
const $ = (id) => document.getElementById(id);

/**
 * UI 要素のイベントリスナーを設定する。
 *
 * @param {object}              params
 * @param {import('./viewer.js').FloorViewer}            params.viewer
 * @param {import('./animation.js').AnimationController}  params.animController
 * @param {object}              params.floorData        parseFloorData の戻り値
 * @param {(jsonString:string)=>void} params.onFileLoad  ファイル読込コールバック
 */
export function setupUI({ viewer, animController, floorData, onFileLoad }) {
  // 表示切替は複数セクション（再生/停止・モード変更）から参照されるため先に定義する
  const applyVisibility = () => {
    viewer.setVisibility({
      undeformed: $(DOM_IDS.chkUndeformed).checked,
      deformed:   $(DOM_IDS.chkDeformed).checked,
      axes:       $(DOM_IDS.chkAxes).checked,
      grid:       $(DOM_IDS.chkGrid).checked,
      labels:     $(DOM_IDS.chkNodeIds).checked && !animController.isPlaying(),
    });
  };

  setupModeControls(animController, applyVisibility);
  setupPlaybackControls(animController, applyVisibility);
  setupSliders(animController);
  setupVisibilityControls(applyVisibility);
  setupLineStyleControls(viewer);
  setupThemeControl(viewer);
  setupLangControl(animController);
  setupPngControl(viewer, animController, floorData);
  setupFileLoad(onFileLoad);

  // 時間表示・ヘルプ内容を初期化
  updateTimeDisplay(animController.getTime());
  const helpContent = $(DOM_IDS.helpContent);
  if (helpContent) helpContent.textContent = t('helpContent');
}

// ─── セクション ─────────────────────────────────────────────────────────────

/** モード選択ドロップダウンと振動数表示 */
function setupModeControls(animController, applyVisibility) {
  const modeSelect = $(DOM_IDS.modeSelect);
  rebuildModeOptions(modeSelect, animController);

  // 先頭モードを選択状態にしておく
  const modeList = animController.getModeList();
  if (modeList.length > 0) {
    modeSelect.value = String(modeList[0]);
  }

  updateFreqDisplay(animController);

  const onModeChange = () => {
    animController.setMode(Number(modeSelect.value));
    updateFreqDisplay(animController);
    updateTimeDisplay(animController.getTime());
    // setMode で停止状態になるため、ラベル表示などを再評価する
    applyVisibility();
  };
  replaceListener(modeSelect, 'change', onModeChange, '_onModeChange');
}

/** 再生 / 停止ボタン */
function setupPlaybackControls(animController, applyVisibility) {
  const btnPlay = $(DOM_IDS.btnPlay);
  const btnStop = $(DOM_IDS.btnStop);

  const onPlay = () => { animController.play(); applyVisibility(); };
  const onStop = () => { animController.stop(); applyVisibility(); };
  replaceListener(btnPlay, 'click', onPlay, '_onPlay');
  replaceListener(btnStop, 'click', onStop, '_onStop');
}

/** 速度・変形倍率スライダー */
function setupSliders(animController) {
  const speedSlider = $(DOM_IDS.speedSlider);
  const speedValue  = $(DOM_IDS.speedValue);
  speedSlider.value = String(SPEED.DEFAULT);
  speedValue.textContent = SPEED.DEFAULT.toFixed(1);
  animController.setSpeed(SPEED.DEFAULT);
  wireSlider(speedSlider, speedValue, (v) => animController.setSpeed(v), '_onSpeedInput');

  const scaleSlider = $(DOM_IDS.scaleSlider);
  const scaleValue  = $(DOM_IDS.scaleValue);
  scaleSlider.value = String(SCALE.DEFAULT);
  scaleValue.textContent = SCALE.DEFAULT.toFixed(1);
  animController.setScale(SCALE.DEFAULT);
  wireSlider(scaleSlider, scaleValue, (v) => animController.setScale(v), '_onScaleInput');
}

/** 表示切替チェックボックス */
function setupVisibilityControls(applyVisibility) {
  const checks = [
    DOM_IDS.chkUndeformed, DOM_IDS.chkDeformed, DOM_IDS.chkAxes,
    DOM_IDS.chkGrid, DOM_IDS.chkNodeIds,
  ].map($);

  // 初期状態を全て checked に戻す
  checks.forEach((chk) => { chk.checked = true; });

  // 初回適用
  applyVisibility();

  const onVisChange = () => applyVisibility();
  checks.forEach((chk, i) => replaceListener(chk, 'change', onVisChange, `_onVis${i}`));
}

/** 線の色・太さ設定 */
function setupLineStyleControls(viewer) {
  const colorUndeformed = $(DOM_IDS.colorUndeformed);
  const widthUndeformed = $(DOM_IDS.widthUndeformed);
  const widthUndefVal   = $(DOM_IDS.widthUndeformedVal);
  const colorDeformed   = $(DOM_IDS.colorDeformed);
  const widthDeformed   = $(DOM_IDS.widthDeformed);
  const widthDefVal     = $(DOM_IDS.widthDeformedVal);

  // カラーピッカーをビューアーの現在のマテリアル色（テーマ反映済み）に同期
  const lineColors = viewer.getLineColors();
  colorUndeformed.value = lineColors.undeformedColor;
  colorDeformed.value   = lineColors.deformedColor;

  const onColorUndeformed = () => viewer.setLineStyle({ undeformedColor: colorUndeformed.value });
  const onColorDeformed   = () => viewer.setLineStyle({ deformedColor: colorDeformed.value });
  replaceListener(colorUndeformed, 'input', onColorUndeformed, '_onColorUndef');
  replaceListener(colorDeformed,   'input', onColorDeformed,   '_onColorDef');

  wireSlider(widthUndeformed, widthUndefVal, (w) => viewer.setLineStyle({ undeformedWidth: w }), '_onWidthUndef');
  wireSlider(widthDeformed,   widthDefVal,   (w) => viewer.setLineStyle({ deformedWidth: w }),   '_onWidthDef');
}

/** テーマ切替ボタン */
function setupThemeControl(viewer) {
  const btnTheme = $(DOM_IDS.btnTheme);
  const onThemeToggle = () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') !== 'dark';
    html.setAttribute('data-theme', isDark ? 'dark' : '');
    viewer.setThemeColors(isDark);
    updateThemeButtonLabel();
    localStorage.setItem(STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
  };
  replaceListener(btnTheme, 'click', onThemeToggle, '_onThemeToggle');
}

/** 言語切替ボタン */
function setupLangControl(animController) {
  const btnLang = $(DOM_IDS.btnLang);
  const onLangToggle = () => {
    setLang(getLang() === 'ja' ? 'en' : 'ja');
    applyTranslations();
    btnLang.textContent = t('btnLang');
    updateThemeButtonLabel();
    // モード選択を再構築 / 各表示を更新
    rebuildModeOptions($(DOM_IDS.modeSelect), animController);
    updateTimeDisplay(animController.getTime());
    const helpContent = $(DOM_IDS.helpContent);
    if (helpContent) helpContent.textContent = t('helpContent');
    // ファイル名表示更新（ファイル未選択時のみ）
    const fnd = $(DOM_IDS.fileNameDisplay);
    if (fnd && !fnd._hasFile) fnd.textContent = t('fileNameNone');
  };
  replaceListener(btnLang, 'click', onLangToggle, '_onLangToggle');
}

/** PNG 保存ボタン */
function setupPngControl(viewer, animController, floorData) {
  const btnDownload = $(DOM_IDS.btnDownload);
  const onDownload = async () => {
    if (animController.isPlaying()) {
      alert(t('alertPngStop'));
      return;
    }
    const filename = buildPngFilename(floorData, animController);
    try {
      await viewer.savePNG(filename);
    } catch (err) {
      console.error('PNG save failed:', err);
      alert(t('alertPngFail', { msg: err.message }));
    }
  };
  replaceListener(btnDownload, 'click', onDownload, '_onDownload');
}

/** ファイル読込（hidden input + カスタムボタン） */
function setupFileLoad(onFileLoad) {
  const fileInput = $(DOM_IDS.fileInput);
  const btnSelectFile = $(DOM_IDS.btnSelectFile);
  const fileNameDisplay = $(DOM_IDS.fileNameDisplay);

  fileNameDisplay.textContent = t('fileNameNone');
  fileNameDisplay._hasFile = false;

  const onSelectFile = () => { fileInput.click(); };
  replaceListener(btnSelectFile, 'click', onSelectFile, '_onSelectFile');

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fileNameDisplay.textContent = file.name;
    fileNameDisplay._hasFile = true;

    const reader = new FileReader();
    reader.onload = () => { onFileLoad(reader.result); };
    reader.onerror = () => { alert(t('alertFileError', { msg: reader.error.message })); };
    reader.readAsText(file);

    // 同じファイルを再選択できるようにリセット
    fileInput.value = '';
  };
  replaceListener(fileInput, 'change', onFileChange, '_onFileChange');
}

// ─── 表示更新 ───────────────────────────────────────────────────────────────

/**
 * 時間表示を更新する。
 * @param {number} time  現在時刻 [s]
 */
export function updateTimeDisplay(time) {
  const el = $(DOM_IDS.timeDisplay);
  if (el) {
    el.textContent = t('timeDisplay', { t: time.toFixed(3) });
  }
}

/**
 * 振動数表示を更新する。
 * @param {import('./animation.js').AnimationController} animController
 */
function updateFreqDisplay(animController) {
  const el = $(DOM_IDS.freqDisplay);
  if (el) {
    el.textContent = t('freqDisplay', { f: animController.getFreqHz().toFixed(2) });
  }
}

/** テーマボタンのラベルを現在のテーマに合わせて更新する。 */
function updateThemeButtonLabel() {
  const btnTheme = $(DOM_IDS.btnTheme);
  if (!btnTheme) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btnTheme.textContent = t(isDark ? 'btnThemeDark' : 'btnThemeLight');
}

// ─── ヘルパー ───────────────────────────────────────────────────────────────

/** モード選択 option を現在の言語・モード一覧で再構築する（選択値は保持）。 */
function rebuildModeOptions(selectEl, animCtrl) {
  const currentValue = selectEl.value;
  selectEl.innerHTML = '';
  for (const modeNum of animCtrl.getModeList()) {
    const opt = document.createElement('option');
    opt.value = String(modeNum);
    const freq = animCtrl.getFreqHz(modeNum);
    opt.textContent = t('modeOption', { n: modeNum, f: freq.toFixed(2) });
    selectEl.appendChild(opt);
  }
  selectEl.value = currentValue;
}

/**
 * range スライダーの input を配線する共通ヘルパー。
 * 値を valEl に小数表示し、apply(値) を呼ぶ。
 *
 * @param {HTMLInputElement} slider
 * @param {HTMLElement}      valEl
 * @param {(value:number)=>void} apply
 * @param {string}           slot    要素に保存するハンドラ slot 名
 * @param {number}           [digits=1]
 */
function wireSlider(slider, valEl, apply, slot, digits = 1) {
  const handler = () => {
    const v = parseFloat(slider.value);
    valEl.textContent = v.toFixed(digits);
    apply(v);
  };
  replaceListener(slider, 'input', handler, slot);
}

/**
 * 要素のイベントリスナーを安全に差し替える。
 * setupUI が複数回呼ばれてもリスナーが多重登録されない。
 *
 * @param {HTMLElement} el
 * @param {string}      event
 * @param {Function}    handler
 * @param {string}      slotKey  要素に保存するプロパティ名
 */
function replaceListener(el, event, handler, slotKey) {
  if (el[slotKey]) {
    el.removeEventListener(event, el[slotKey]);
  }
  el[slotKey] = handler;
  el.addEventListener(event, handler);
}

/**
 * PNG 保存ファイル名を組み立てる。
 *
 * 形式: floormode_<title>_mode<mode>_t<sec3>_x<scale>.png
 *
 * @param {object} floorData
 * @param {import('./animation.js').AnimationController} animController
 * @returns {string}
 */
function buildPngFilename(floorData, animController) {
  // title: ケバブケース変換（スペース→ハイフン, 小文字）
  const rawTitle = (floorData.meta && floorData.meta.title) || 'untitled';
  const title = rawTitle
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

  // 現在のモード番号 — getModeList の先頭をフォールバックに使う
  const modeList = animController.getModeList();
  let currentMode = modeList.length > 0 ? modeList[0] : 1;
  const modeSelect = $(DOM_IDS.modeSelect);
  if (modeSelect && modeSelect.value) {
    currentMode = Number(modeSelect.value);
  }

  const sec3 = animController.getTime().toFixed(3);

  const scaleSlider = $(DOM_IDS.scaleSlider);
  const scale = scaleSlider ? parseFloat(scaleSlider.value).toFixed(1) : SCALE.DEFAULT.toFixed(1);

  return `floormode_${title}_mode${currentMode}_t${sec3}_x${scale}.png`;
}

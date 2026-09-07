/**
 * ui.js -- UIコントロール・イベント管理
 *
 * setupUI を責務ごとのセクション関数へ分割し、各セクションは
 * DOM_IDS と共通ヘルパー（replaceListener / wireSlider）を介して配線する。
 *
 * @module ui
 */

import { t, setLang, getLang, applyTranslations } from './i18n.js';
import { DOM_IDS, SCALE, SPEED, STORAGE_KEYS, CAMERA_PRESETS } from './constants.js';
import { assessFrequency, RISK } from './assessment.js';
import { buildDisplayExport } from './export.js';
import { playbackAction } from './playback.js';
import { downloadBlob } from './downloads.js';

/** getElementById の短縮 */
const $ = (id) => document.getElementById(id);
const playbackState = new WeakMap();
const listeners = new Set();
export function disposeUI() {
  for (const remove of listeners) remove();
  listeners.clear();
}

/**
 * UI 要素のイベントリスナーを設定する。
 *
 * @param {object}              params
 * @param {import('./viewer.js').FloorViewer}            params.viewer
 * @param {import('./animation.js').AnimationController}  params.animController
 * @param {object}              params.floorData        parseFloorData の戻り値
 * @param {(jsonString:string)=>void} params.onFileLoad  ファイル読込コールバック
 */
export function setupUI({ viewer, animController, floorData, beforeCapture = () => {} }) {
  disposeUI();
  const isResponse = animController.getDataKind() === 'response';

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

  // モード依存の各表示（振動数・周期・共振帯screening・モード形テーブル・最大振幅）と
  // タイムラインの範囲を一括更新する。
  const refreshModeInfo = () => {
    updateDataKindDisplays(animController);
    if (!isResponse) {
      updateFreqDisplay(animController);
      updatePeriodDisplay(animController);
      updateHabitability(animController);
    } else {
      updateResponseLegend(animController);
    }
    updateModeShapeTable(animController, true);
    updateHighlight(viewer, animController);
    resetTimeline(animController);
  };

  setupModeControls(animController, applyVisibility, refreshModeInfo);
  setupPlaybackControls(animController, applyVisibility);
  setupTimeline(animController, applyVisibility);
  setupViewControls(viewer);
  setupSliders(animController);
  setupResponseControls(animController, refreshModeInfo);
  setupVisibilityControls(applyVisibility);
  setupHighlightControl(viewer, animController);
  setupLineStyleControls(viewer);
  setupThemeControl(viewer);
  setupLangControl(animController, refreshModeInfo);
  setupPngControl(viewer, animController, floorData, beforeCapture);
  setupExportControls(animController, floorData);

  setupKeyboardShortcuts(animController, applyVisibility);

  // 初期表示
  refreshModeInfo();
  updateTimeDisplay(animController.getTime());
  replaceListener(document.getElementById('modeshape-section'), 'toggle', () => updateModeShapeTable(animController, true), '_onTableToggle');
  const helpContent = $(DOM_IDS.helpContent);
  if (helpContent) helpContent.textContent = t('helpContent');
}

// ─── セクション ─────────────────────────────────────────────────────────────

/** モード選択ドロップダウンと振動数表示 */
function setupModeControls(animController, applyVisibility, refreshModeInfo) {
  const modeSelect = $(DOM_IDS.modeSelect);
  if (animController.getDataKind() === 'response') {
    modeSelect.innerHTML = '';
    return;
  }
  rebuildModeOptions(modeSelect, animController);

  // 先頭モードを選択状態にしておく
  const modeList = animController.getModeList();
  if (modeList.length > 0) {
    modeSelect.value = String(modeList[0]);
  }

  const onModeChange = () => {
    animController.setMode(Number(modeSelect.value));
    refreshModeInfo();
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

/** 速度・変形倍率スライダー（数値入力ボックス併用） */
function setupSliders(animController) {
  const speedSlider = $(DOM_IDS.speedSlider);
  const speedValue  = $(DOM_IDS.speedValue);
  const speedNumber = $(DOM_IDS.speedNumber);
  speedSlider.value = String(SPEED.DEFAULT);
  speedValue.textContent = SPEED.DEFAULT.toFixed(1);
  animController.setSpeed(SPEED.DEFAULT);
  wireSliderWithNumber(speedSlider, speedNumber, speedValue, SPEED,
    (v) => animController.setSpeed(v), '_onSpeed');

  const scaleSlider = $(DOM_IDS.scaleSlider);
  const scaleValue  = $(DOM_IDS.scaleValue);
  const scaleNumber = $(DOM_IDS.scaleNumber);
  scaleSlider.disabled = false;
  if (scaleNumber) scaleNumber.disabled = false;
  scaleSlider.value = String(SCALE.DEFAULT);
  scaleValue.textContent = SCALE.DEFAULT.toFixed(1);
  animController.setScale(SCALE.DEFAULT);
  wireSliderWithNumber(scaleSlider, scaleNumber, scaleValue, SCALE,
    (v) => animController.setScale(v), '_onScale');
}

/** タイムライン（スクラブ＋コマ送り） */
function setupTimeline(animController, applyVisibility) {
  const slider = $(DOM_IDS.timeSlider);
  const run = (action, value) => {
    playbackAction(animController, action, value);
    syncPlayback(animController);
    applyVisibility();
  };
  replaceListener(slider, 'input', () => run('seek', Number(slider.value)), '_onScrub');
  replaceListener($(DOM_IDS.btnStepBack), 'click', () => run('step', -1), '_onStepBack');
  replaceListener($(DOM_IDS.btnStepFwd), 'click', () => run('step', 1), '_onStepFwd');
}

function syncPlayback(controller) {
  resetTimeline(controller);
  updateTimeDisplay(controller.getTime());
  updateModeShapeTable(controller, true);
}

/** 応答archiveの表示正規化ON/OFF。OFF時は倍率を無効化し実値を保持する。 */
function setupResponseControls(animController, refreshDisplays) {
  if (animController.getDataKind() !== 'response') return;
  const checkbox = $(DOM_IDS.chkResponseNormalization);
  const slider = $(DOM_IDS.scaleSlider);
  const number = $(DOM_IDS.scaleNumber);
  checkbox.checked = true;
  animController.setDisplayNormalized(true);

  const onChange = () => {
    animController.setDisplayNormalized(checkbox.checked);
    slider.disabled = !checkbox.checked;
    if (number) number.disabled = !checkbox.checked;
    refreshDisplays();
  };
  replaceListener(checkbox, 'change', onChange, '_onResponseNormalization');
}

/** カメラ プリセットビュー */
function setupViewControls(viewer) {
  const map = [
    [DOM_IDS.btnViewIso, CAMERA_PRESETS.iso],
    [DOM_IDS.btnViewTop, CAMERA_PRESETS.top],
    [DOM_IDS.btnViewFront, CAMERA_PRESETS.front],
    [DOM_IDS.btnViewSide, CAMERA_PRESETS.side],
  ];
  map.forEach(([id, preset], i) => {
    replaceListener($(id), 'click', () => viewer.setView(preset), `_onView${i}`);
  });
}

/** 最大変位ハイライト チェックボックス */
function setupHighlightControl(viewer, animController) {
  const chk = $(DOM_IDS.chkHighlight);
  chk.checked = false;
  const onChange = () => updateHighlight(viewer, animController);
  replaceListener(chk, 'change', onChange, '_onHighlight');
}

/** 現フレームの表示座標／応答値の出力（CSV / JSON） */
function setupExportControls(animController, floorData) {
  const onCsv = () => exportDisplacement(animController, floorData, 'csv');
  const onJson = () => exportDisplacement(animController, floorData, 'json');
  replaceListener($(DOM_IDS.btnExportCsv), 'click', onCsv, '_onExportCsv');
  replaceListener($(DOM_IDS.btnExportJson), 'click', onJson, '_onExportJson');
}

/** キーボードショートカット（Space=再生/停止, ←/→=コマ送り, R=リセット） */
function setupKeyboardShortcuts(animController, applyVisibility) {
  const onKeydown = (e) => {
    if (document.body.dataset.recording === 'true') return;
    if (e.target?.closest?.('input, select, textarea, button, [contenteditable="true"]')) return;
    const actions = { ' ': ['toggle'], ArrowRight: ['step', 1], ArrowLeft: ['step', -1], r: ['reset'], R: ['reset'] };
    if (!actions[e.key] || e.repeat) return;
    e.preventDefault();
    playbackAction(animController, ...actions[e.key]);
    syncPlayback(animController);
    applyVisibility();
  };
  replaceListener(document, 'keydown', onKeydown, '_onFloorKeydown');
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
    try { localStorage.setItem(STORAGE_KEYS.theme, isDark ? 'dark' : 'light'); } catch { /* storage unavailable */ }
  };
  replaceListener(btnTheme, 'click', onThemeToggle, '_onThemeToggle');
  updateThemeButtonLabel();
}

/** 言語切替ボタン */
function setupLangControl(animController, refreshModeInfo) {
  const btnLang = $(DOM_IDS.btnLang);
  const onLangToggle = () => {
    setLang(getLang() === 'ja' ? 'en' : 'ja');
    applyTranslations();
    btnLang.textContent = t('btnLang');
    updateThemeButtonLabel();
    // モード選択を再構築 / 各表示を更新
    rebuildModeOptions($(DOM_IDS.modeSelect), animController);
    refreshModeInfo();
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
function setupPngControl(viewer, animController, floorData, beforeCapture) {
  const btnDownload = $(DOM_IDS.btnDownload);
  const onDownload = async () => {
    if (animController.isPlaying()) {
      alert(t('alertPngStop'));
      return;
    }
    const filename = buildPngFilename(floorData, animController);
    try {
      beforeCapture();
      const width = Number(document.getElementById('capture-size')?.value) || 1600;
      await viewer.savePNG(filename, { width, height: Math.round(width * 0.625), background: document.getElementById('capture-background')?.value || undefined });
    } catch (err) {
      console.error('PNG save failed:', err);
      alert(t('alertPngFail', { msg: err.message }));
    }
  };
  replaceListener(btnDownload, 'click', onDownload, '_onDownload');
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
 * 再生中の各表示（時間・タイムライン位置）を更新する。app のループから毎フレーム呼ぶ。
 * @param {import('./animation.js').AnimationController} animController
 * @param {import('./viewer.js').FloorViewer} [viewer]
 */
export function updatePlaybackDisplays(animController, viewer) {
  const time = animController.getTime();
  const playing = animController.isPlaying();
  if (document.body.dataset.recording !== 'true') {
    $(DOM_IDS.btnPlay).disabled = playing;
    $(DOM_IDS.btnStop).disabled = !playing;
  }
  const wasPlaying = playbackState.get(animController) ?? playing;
  if (viewer && wasPlaying && !playing) {
    viewer.setVisibility({ labels: Boolean($(DOM_IDS.chkNodeIds)?.checked) });
  }
  playbackState.set(animController, playing);

  updateTimeDisplay(time);
  if (animController.getDataKind() === 'response') {
    const slider = $(DOM_IDS.timeSlider);
    if (slider) slider.value = String(time);
    updateResponseLegend(animController);
    updateModeShapeTable(animController);
    if (viewer) updateHighlight(viewer, animController);
    return;
  }
  // 再生中のみタイムラインを追従（ユーザーのドラッグと競合させない）
  if (animController.isPlaying()) {
    const slider = $(DOM_IDS.timeSlider);
    const period = animController.getPeriod();
    if (slider && period > 0) slider.value = String(time % period);
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

/** 周期 T 表示を更新する。 */
function updatePeriodDisplay(animController) {
  const el = $(DOM_IDS.periodDisplay);
  if (!el) return;
  const period = animController.getPeriod();
  el.textContent = period > 0 ? t('periodDisplay', { t: period.toFixed(3) }) : '';
}

/** 歩行共振帯の一次スクリーニング表示を更新する。 */
function updateHabitability(animController) {
  const el = $(DOM_IDS.habitabilityDisplay);
  if (!el) return;
  const { risk } = assessFrequency(animController.getFreqHz());
  if (risk === RISK.HIGH) {
    el.textContent = t('habHigh');
    el.dataset.risk = 'high';
  } else if (risk === RISK.MEDIUM) {
    el.textContent = t('habMedium');
    el.dataset.risk = 'medium';
  } else {
    el.textContent = '';
    el.dataset.risk = 'low';
  }
}

/** 最大変位ハイライトを現在の状態（チェック有無・現モード）に同期する。 */
function updateHighlight(viewer, animController) {
  const chk = $(DOM_IDS.chkHighlight);
  const on = chk && chk.checked;
  viewer.setHighlightNode(on ? animController.getMaxNode() : null);
}

/** タイムラインの範囲を現モードの周期に合わせ、位置を 0 に戻す。 */
function resetTimeline(animController) {
  const slider = $(DOM_IDS.timeSlider);
  if (!slider) return;
  const range = animController.getTimelineRange();
  slider.min = String(range.min);
  slider.max = String(range.max);
  slider.step = String(Math.max((range.max - range.min) / 1000, 1e-6));
  slider.value = String(animController.getTime());
  if (animController.getDataKind() === 'response') return;
  const period = animController.getPeriod();
  if (period > 0) {
    slider.max = String(period);
    slider.step = String(period / 1000);
  }
  slider.value = String(period > 0 ? animController.getTime() % period : animController.getTime());
}

/** 現モードのモード形（節点ごとの正規化 uz）テーブルを再構築する。 */
function updateModeShapeTable(animController, force = false) {
  const container = $(DOM_IDS.modeshapeTable);
  if (!container) return;

  const isResponse = animController.getDataKind() === 'response';
  if (!force && !document.getElementById('modeshape-section')?.open) return;
  if (isResponse) {
    const time = animController.getTime();
    if (!force && container._responseTime === time) return;
    container._responseTime = time;
  } else {
    container._responseTime = undefined;
  }

  const nodeIds = animController.getNodeIds();
  const maxNode = animController.getMaxNode();

  const page = Math.min(container._page || 0, Math.max(0, Math.ceil(nodeIds.length / 200) - 1));
  const pageIds = nodeIds.slice(page * 200, (page + 1) * 200);
  const rows = pageIds.map((id) => {
    const value = isResponse
      ? animController.getResponseValue(id)
      : animController.getNormalizedUz(id);
    const mark = id === maxNode ? ' ★' : '';
    return `<tr><td>${id}${mark}</td><td>${value.toFixed(isResponse ? 6 : 3)}</td></tr>`;
  }).join('');

  const summary = document.querySelector('#modeshape-section summary');
  if (summary) summary.textContent = t(isResponse ? 'labelResponseValues' : 'labelModeShape');

  container.innerHTML =
    `<table class="modeshape"><thead><tr>` +
    `<th>${t('thNode')}</th><th>${t(isResponse ? 'thResponseValue' : 'thUz')}</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>`;
  if (nodeIds.length > 200) {
    for (const [symbol, direction] of [['←', -1], ['→', 1]]) {
      const button = document.createElement('button');
      button.textContent = symbol;
      button.type = 'button';
      button.disabled = direction < 0 ? page === 0 : (page + 1) * 200 >= nodeIds.length;
      button.onclick = () => { container._page = page + direction; updateModeShapeTable(animController, true); };
      container.appendChild(button);
    }
    container.appendChild(document.createTextNode(` ${page + 1} / ${Math.ceil(nodeIds.length / 200)}`));
  }
}

function updateDataKindDisplays(animController) {
  const isResponse = animController.getDataKind() === 'response';
  $(DOM_IDS.modalControls).hidden = isResponse;
  $(DOM_IDS.responseInfo).hidden = !isResponse;
  $(DOM_IDS.responseNormalizationRow).hidden = !isResponse;
  $(DOM_IDS.responseLegend).hidden = !isResponse;

  const meaning = $(DOM_IDS.displayMeaning);
  const meaningKey = isResponse
    ? (animController.isDisplayNormalized()
      ? 'displayMeaningResponseNormalized'
      : 'displayMeaningResponsePhysical')
    : 'displayMeaningMode';
  meaning.setAttribute('data-i18n', meaningKey);
  meaning.textContent = t(meaningKey);

  const exportLabel = $(DOM_IDS.btnExportCsv).closest('.control-group').querySelector('label');
  exportLabel.setAttribute('data-i18n', isResponse ? 'labelResponseExport' : 'labelExport');
  exportLabel.textContent = t(isResponse ? 'labelResponseExport' : 'labelExport');
  $(DOM_IDS.btnExportCsv).setAttribute(
    'data-i18n', isResponse ? 'btnResponseCsv' : 'btnExportCsv',
  );
  $(DOM_IDS.btnExportJson).setAttribute(
    'data-i18n', isResponse ? 'btnResponseJson' : 'btnExportJson',
  );
  $(DOM_IDS.btnExportCsv).textContent = t(isResponse ? 'btnResponseCsv' : 'btnExportCsv');
  $(DOM_IDS.btnExportJson).textContent = t(isResponse ? 'btnResponseJson' : 'btnExportJson');

  if (isResponse) {
    $(DOM_IDS.responseQuantity).textContent = t('responseQuantity', {
      q: animController.getResponseQuantity(),
    });
    $(DOM_IDS.responseUnit).textContent = t('responseUnit', {
      u: animController.getResponseUnit(),
    });
  }
}

function updateResponseLegend(animController) {
  if (animController.getDataKind() !== 'response') return;
  const range = animController.getResponseRange();
  $(DOM_IDS.responseLegendTitle).textContent = t('responseLegend', {
    q: animController.getResponseQuantity(),
    u: animController.getResponseUnit(),
  });
  $(DOM_IDS.responseLegendMin).textContent = range.min.toPrecision(4);
  $(DOM_IDS.responseLegendMax).textContent = range.max.toPrecision(4);
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
 * スライダーと数値入力ボックスを双方向同期して配線する。
 * 両者と表示ラベルを同期し、range の [MIN, MAX] にクランプして apply(値) を呼ぶ。
 *
 * @param {HTMLInputElement} slider
 * @param {HTMLInputElement} numberEl
 * @param {HTMLElement}      valEl
 * @param {{MIN:number, MAX:number}} range
 * @param {(value:number)=>void} apply
 * @param {string}           slot
 * @param {number}           [digits=1]
 */
function wireSliderWithNumber(slider, numberEl, valEl, range, apply, slot, digits = 1) {
  if (numberEl) numberEl.value = slider.value;

  const commit = (raw, { syncSlider, syncNumber }) => {
    let v = parseFloat(raw);
    if (Number.isNaN(v)) return;
    v = Math.max(range.MIN, Math.min(range.MAX, v));
    if (syncSlider) slider.value = String(v);
    if (syncNumber && numberEl) numberEl.value = String(v);
    valEl.textContent = v.toFixed(digits);
    apply(v);
  };

  replaceListener(slider, 'input',
    () => commit(slider.value, { syncSlider: false, syncNumber: true }), slot + 'S');
  if (numberEl) {
    // 数値ボックスは change（確定時）でクランプ＆反映する。
    // input 即時クランプだと "0.7" 入力時に先頭 "0" が即クランプされ打ちづらいため。
    replaceListener(numberEl, 'change',
      () => commit(numberEl.value, { syncSlider: true, syncNumber: true }), slot + 'N');
  }
}

/**
 * 現フレームの表示座標／応答値を CSV / JSON でダウンロードする。
 *
 * @param {import('./animation.js').AnimationController} animController
 * @param {object} floorData
 * @param {'csv'|'json'} format
 */
function exportDisplacement(animController, floorData, format) {
  const time = animController.getTime();
  const mode = animController.getCurrentMode?.() ?? 0;
  const { content, mime, ext } = buildDisplayExport(animController, floorData, format);
  const base = buildExportBasename(floorData, mode, time, animController.getDataKind?.());
  downloadBlob(content, `${base}.${ext}`, mime);
}

/** 出力ファイル名のベース（拡張子なし）を組み立てる。 */
function buildExportBasename(floorData, mode, time, dataKind = 'mode') {
  if (dataKind === 'response') {
    return `floorresponse_${kebabTitle(floorData)}_t${time.toFixed(3)}`;
  }
  return `floormode_${kebabTitle(floorData)}_mode${mode}_t${time.toFixed(3)}`;
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
  listeners.add(() => { el.removeEventListener(event, handler); if (el[slotKey] === handler) delete el[slotKey]; });
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
/**
 * meta.title をファイル名向けのケバブケースに変換する。
 * 英数字以外（日本語等）が除去されて空になった場合は 'untitled' を返す。
 * @param {object} floorData
 * @returns {string}
 */
function kebabTitle(floorData) {
  const rawTitle = (floorData.meta && floorData.meta.title) || 'untitled';
  const title = rawTitle
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return title || 'untitled';
}

function buildPngFilename(floorData, animController) {
  const title = kebabTitle(floorData);
  const sec3 = animController.getTime().toFixed(3);

  if (animController.getDataKind() === 'response') {
    const normalized = animController.isDisplayNormalized() ? 'normalized' : 'physical';
    return `floorresponse_${title}_t${sec3}_${normalized}.png`;
  }

  // 現在のモード番号 — getModeList の先頭をフォールバックに使う
  const modeList = animController.getModeList();
  let currentMode = modeList.length > 0 ? modeList[0] : 1;
  const modeSelect = $(DOM_IDS.modeSelect);
  if (modeSelect && modeSelect.value) {
    currentMode = Number(modeSelect.value);
  }

  const scaleSlider = $(DOM_IDS.scaleSlider);
  const scale = scaleSlider ? parseFloat(scaleSlider.value).toFixed(1) : SCALE.DEFAULT.toFixed(1);

  return `floormode_${title}_mode${currentMode}_t${sec3}_x${scale}.png`;
}

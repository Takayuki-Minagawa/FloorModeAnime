/* ========================================================================
   i18n.js -- 多言語対応モジュール (ja / en)
   ======================================================================== */

import { STORAGE_KEYS } from './constants.js';

const STORAGE_KEY = STORAGE_KEYS.lang;

const dict = {
  ja: {
    loadReading: "ファイル読込中",
    loadParsing: "データ解析中",
    loadValidating: "整合性を確認中",
    loadReady: "読込完了",
    loadCancelled: "取消しました",
    loadError: "読込に失敗しました。別のファイルを選択できます。",
    cancel: "取消",
    observation: "モード観察用再生",
    normalPlayback: "通常速度",
    cycle2: "1周期を2秒",
    cycle4: "1周期を4秒",
    inspectNode: "節点の確認",
    nodeId: "節点ID",
    jumpPeak: "節点ピークへ",
    jumpGlobal: "全体ピークへ",
    historyCsv: "節点時刻歴CSV",
    envelope: "最大絶対値包絡（時刻混在）",
    compare: "ケース比較・鉛直MAC",
    compareMode: "比較モード",
    invertSign: "比較形状の符号を反転",
    clearCompare: "比較を終了",
    macHint: "同一位相・鉛直成分のみ。MACは合否判定ではありません。",
    captureOptions: "画像・動画の設定",
    imageWidth: "画像幅",
    background: "背景",
    currentTheme: "現在のテーマ",
    white: "白",
    dark: "暗色",
    videoDuration: "録画秒数（1～30秒）",
    saveVideo: "動画保存",
    settings: "表示条件の保存・復元",
    saveSettings: "条件JSONを保存",
    restoreSettings: "条件JSONを復元",
    invalidNode: "存在する節点IDを入力してください",
    invalidDuration: "録画秒数は1～30秒で指定してください",
    recording: "録画中",
    saved: "保存しました",
    videoUnavailable: "この環境では動画出力できません。PNG保存をご利用ください。",
    normalizedValue: "（正規化 uz/Umax）",
    observationActive: "観察用スロー再生: 画面上の1周期 = {seconds}秒。表示時刻は解析上の時刻です。",
    historyTitle: "節点{id}の物理応答時刻歴",
    peakMinimum: "最小",
    peakMaximum: "最大",
    envelopeMeaning: "包絡: 各節点の全時刻最大絶対値を未変形面に表示（同一時刻の変形ではありません）",
    undefinedMac: "評価不能",
    samePhase: "同一位相で比較",

    pageTitle: '床モードアニメ',
    panelTitle: 'コントロール',
    labelMode: 'モード',
    labelTime: '時間',
    labelSpeed: '速度',
    labelScale: '倍率',
    labelVisibility: '表示切替',
    labelLoadJson: 'データ読込',
    btnSelectFile: 'ファイルを選択',
    fileNameNone: '選択なし',
    btnPlay: '▶ 再生',
    btnStop: '■ 停止',
    btnSavePng: '💾 PNG保存',
    btnThemeLight: '☀ ライト',
    btnThemeDark: '☾ ダーク',
    btnLang: 'EN',
    btnHelp: '❓ ヘルプ',
    chkUndeformed: '未変形',
    chkDeformed: '変形',
    chkAxes: '軸',
    chkGrid: 'グリッド',
    chkNodeIds: '節点番号',
    fileInputHint: 'calc YAML・modal result JSON・任意のmanifest、または応答archive JSONを読み込みます',
    modeOption: 'モード {n} ({f} Hz)',
    freqDisplay: 'f = {f} Hz',
    periodDisplay: 'T = {t} s',
    timeDisplay: 't = {t} s',
    loadingOption: '-- 読込中 --',
    labelLineStyle: '線の設定',
    labelTimeline: 'タイムライン',
    titleStepBack: 'コマ戻し',
    titleStepFwd: 'コマ送り',
    labelView: '視点',
    viewIso: '等角',
    viewTop: '平面',
    viewFront: '正面',
    viewSide: '側面',
    chkHighlight: '最大振幅',
    labelScreening: '歩行共振帯スクリーニング',
    labelExport: '表示用正規化座標',
    btnExportCsv: '表示座標CSV',
    btnExportJson: '表示座標JSON',
    labelResponseExport: '物理応答archive値',
    btnResponseCsv: '応答値CSV',
    btnResponseJson: '応答値JSON',
    labelModeShape: 'モード形 数値',
    labelResponseValues: '物理応答 数値',
    thNode: '節点',
    thUz: '正規化uz',
    thResponseValue: '応答実値',
    dropHint: 'modalデータ一式、または応答archiveをドロップして読み込み',
    habHigh: '⚠ 歩行共振帯',
    habMedium: '△ 倍音共振帯',
    labelResponse: '物理応答',
    chkResponseNormalization: '表示を L/10 に正規化',
    responseQuantity: '応答量: {q}',
    responseUnit: '単位: {u}',
    displayMeaningMode: '表示振幅: 床寸法 L/10 に正規化した演出（物理応答ではありません）',
    displayMeaningResponseNormalized: '物理応答archive: 色は実値、形状のみ床寸法 L/10 に正規化',
    displayMeaningResponsePhysical: '物理応答archive: 正規化OFF（鉛直表示量はarchive実値と数値一致。変位量でない応答を変位とは解釈しません）',
    responseLegend: '{q} [{u}]',
    unitLabel: '単位: {u}',
    alertPngStop: 'PNG保存はアニメーション停止中のみ実行できます。',
    alertPngFail: 'PNG保存失敗: {msg}',
    alertFileError: 'ファイル読込エラー: {msg}',
    errorJsonParse: 'E_JSON_PARSE: {msg}',
    errorDataParse: 'E_DATA_PARSE: {msg}',
    errorWebGL: 'E_WEBGL: 3D描画の初期化に失敗しました: {msg}',
    errorFetch: 'E_FETCH: サンプルデータの読込に失敗しました: {msg}',
    messageSummaryWarnings: '警告 {count} 件（クリックで詳細）',
    messageSummaryErrors: 'エラー {count} 件（詳細表示中）',
    messageSummaryBoth: 'エラー {errors} 件 / 警告 {warnings} 件',
    helpTitle: '使い方',
    helpContent:
      '1. サンプルデータが自動的に読み込まれます。独自の calc YAML + result JSON + manifest、または応答archiveも「データ読込」から読み込めます。\n' +
      '2. 「モード」ドロップダウンで振動モードを切り替えます。\n' +
      '3. 「再生」で振動アニメーションを開始、「停止」で一時停止します。\n' +
      '4. 「速度」スライダーでアニメーション速度を調整します（0.2x〜2.0x）。\n' +
      '5. 「倍率」スライダーで表示スケールを調整します（0.5〜3.0）。モード表示は常に床寸法L/10基準で、物理応答ではありません。\n' +
      '6. 「表示切替」チェックボックスで各要素の表示/非表示を制御します。\n' +
      '7. アニメーション停止中に「PNG保存」でスクリーンショットを保存できます。\n' +
      '8. マウスドラッグで回転、右クリックドラッグでパン、スクロールでズームできます。',
  },
  en: {
    loadReading: "Reading files",
    loadParsing: "Parsing data",
    loadValidating: "Validating data",
    loadReady: "Ready",
    loadCancelled: "Cancelled",
    loadError: "Load failed. You can select another file.",
    cancel: "Cancel",
    observation: "Mode observation playback",
    normalPlayback: "Normal speed",
    cycle2: "2 seconds per cycle",
    cycle4: "4 seconds per cycle",
    inspectNode: "Inspect node",
    nodeId: "Node ID",
    jumpPeak: "Node peak",
    jumpGlobal: "Global peak",
    historyCsv: "Node history CSV",
    envelope: "Maximum absolute envelope (mixed times)",
    compare: "Compare cases / vertical MAC",
    compareMode: "Comparison mode",
    invertSign: "Invert comparison shape sign",
    clearCompare: "Close comparison",
    macHint: "Same phase, vertical component only. MAC is not a pass/fail assessment.",
    captureOptions: "Image / video options",
    imageWidth: "Image width",
    background: "Background",
    currentTheme: "Current theme",
    white: "White",
    dark: "Dark",
    videoDuration: "Recording seconds (1–30)",
    saveVideo: "Save video",
    settings: "Save / restore display settings",
    saveSettings: "Save settings JSON",
    restoreSettings: "Restore settings JSON",
    invalidNode: "Enter an existing node ID",
    invalidDuration: "Choose a duration between 1 and 30 seconds",
    recording: "Recording",
    saved: "Saved",
    videoUnavailable: "Video capture is unavailable in this environment. Use PNG instead.",
    normalizedValue: "(normalized uz/Umax)",
    observationActive: "Observation slow motion: {seconds} screen seconds per cycle. Displayed time is analysis time.",
    historyTitle: "Node {id} physical response history",
    peakMinimum: "Minimum",
    peakMaximum: "Maximum",
    envelopeMeaning: "Envelope: per-node maximum absolute values over all times on undeformed geometry (not a simultaneous deformed shape)",
    undefinedMac: "Undefined",
    samePhase: "Same phase comparison",

    pageTitle: 'Floor Mode Anime',
    panelTitle: 'Controls',
    labelMode: 'Mode',
    labelTime: 'Time',
    labelSpeed: 'Speed',
    labelScale: 'Scale',
    labelVisibility: 'Visibility',
    labelLoadJson: 'Load Data',
    btnSelectFile: 'Choose File',
    fileNameNone: 'No file chosen',
    btnPlay: '▶ Play',
    btnStop: '■ Stop',
    btnSavePng: '💾 Save PNG',
    btnThemeLight: '☀ Light',
    btnThemeDark: '☾ Dark',
    btnLang: 'JA',
    btnHelp: '❓ Help',
    chkUndeformed: 'Undeformed',
    chkDeformed: 'Deformed',
    chkAxes: 'Axes',
    chkGrid: 'Grid',
    chkNodeIds: 'Node IDs',
    fileInputHint: 'Load calc YAML, modal result JSON, an optional manifest, or a response archive JSON',
    modeOption: 'Mode {n} ({f} Hz)',
    freqDisplay: 'f = {f} Hz',
    periodDisplay: 'T = {t} s',
    timeDisplay: 't = {t} s',
    loadingOption: '-- loading --',
    labelLineStyle: 'Line Style',
    labelTimeline: 'Timeline',
    titleStepBack: 'Step back',
    titleStepFwd: 'Step forward',
    labelView: 'View',
    viewIso: 'Iso',
    viewTop: 'Top',
    viewFront: 'Front',
    viewSide: 'Side',
    chkHighlight: 'Max amplitude',
    labelScreening: 'Walking resonance-band screening',
    labelExport: 'Normalized display coordinates',
    btnExportCsv: 'Display CSV',
    btnExportJson: 'Display JSON',
    labelResponseExport: 'Physical archive values',
    btnResponseCsv: 'Response CSV',
    btnResponseJson: 'Response JSON',
    labelModeShape: 'Mode Shape Values',
    labelResponseValues: 'Physical Response Values',
    thNode: 'Node',
    thUz: 'Norm. uz',
    thResponseValue: 'Response value',
    dropHint: 'Drop a modal data set or response archive to load',
    habHigh: '⚠ Walking resonance',
    habMedium: '△ Harmonic resonance',
    labelResponse: 'Physical response',
    chkResponseNormalization: 'Normalize display to L/10',
    responseQuantity: 'Response: {q}',
    responseUnit: 'Unit: {u}',
    displayMeaningMode: 'Display amplitude: normalized to floor dimension L/10 (not a physical response)',
    displayMeaningResponseNormalized: 'Physical response archive: colors show physical values; shape is normalized to L/10',
    displayMeaningResponsePhysical: 'Physical response archive: normalization OFF (the vertical display ordinate numerically matches the archive; non-displacement quantities are not displacement)',
    responseLegend: '{q} [{u}]',
    unitLabel: 'Unit: {u}',
    alertPngStop: 'PNG can only be saved while animation is stopped.',
    alertPngFail: 'PNG save failed: {msg}',
    alertFileError: 'File read error: {msg}',
    errorJsonParse: 'E_JSON_PARSE: {msg}',
    errorDataParse: 'E_DATA_PARSE: {msg}',
    errorWebGL: 'E_WEBGL: 3D rendering init failed: {msg}',
    errorFetch: 'E_FETCH: Failed to load sample data: {msg}',
    messageSummaryWarnings: '{count} warning(s) - click for details',
    messageSummaryErrors: '{count} error(s) - details shown',
    messageSummaryBoth: '{errors} error(s) / {warnings} warning(s)',
    helpTitle: 'How to Use',
    helpContent:
      '1. Sample data loads automatically. You can also load calc YAML + modal result JSON + manifest, or a response archive, via "Load Data".\n' +
      '2. Use the "Mode" dropdown to switch between vibration modes.\n' +
      '3. Press "Play" to start animation, "Stop" to pause.\n' +
      '4. Adjust animation speed with the "Speed" slider (0.2x - 2.0x).\n' +
      '5. Adjust display scale with the "Scale" slider (0.5 - 3.0). Mode shapes always use the floor-dimension L/10 convention and are not physical response.\n' +
      '6. Toggle element visibility with the "Visibility" checkboxes.\n' +
      '7. Save a screenshot with "Save PNG" while animation is stopped.\n' +
      '8. Mouse drag to rotate, right-click drag to pan, scroll to zoom.',
  },
};

let currentLang = 'ja';

/**
 * 翻訳文字列を取得する。
 * @param {string} key - 辞書キー
 * @param {Object} [params] - 置換パラメータ（例: {n:1, t:'0.00'}）
 * @returns {string}
 */
export function t(key, params) {
  const entry = dict[currentLang] || dict.ja;
  let str = entry[key];
  if (str === undefined) {
    // フォールバック: ja辞書を参照
    str = dict.ja[key];
  }
  if (str === undefined) {
    return key; // キーそのものを返す
  }
  if (params) {
    // replaceAll でリテラル置換（置換値の $ などの特殊パターン展開を回避）
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll('{' + k + '}', String(v));
    }
  }
  return str;
}

/**
 * 言語を設定する。
 * @param {'ja'|'en'} lang
 */
export function setLang(lang) {
  if (dict[lang]) {
    currentLang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch { /* localStorage利用不可 */ }
  }
}

/**
 * 現在の言語コードを返す。
 * @returns {'ja'|'en'}
 */
export function getLang() {
  return currentLang;
}

/**
 * localStorageから言語設定を復元する。保存値がなければデフォルト'ja'。
 */
export function initLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && dict[saved]) {
      currentLang = saved;
    } else {
      currentLang = 'ja';
    }
  } catch {
    currentLang = 'ja';
  }
}

/**
 * DOM上の[data-i18n]属性を持つ要素を一括翻訳する。
 * - document.title も更新する。
 * - LABELタグで子要素がある場合はスキップ（子のspanで翻訳するため）。
 */
export function applyTranslations() {
  document.title = t('pageTitle');
  document.documentElement.lang = currentLang;

  const els = document.querySelectorAll('[data-i18n]');
  els.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    // LABELタグで子要素（Element）がある場合はスキップ
    if (el.tagName === 'LABEL' && el.children.length > 0) {
      return;
    }
    el.textContent = t(key);
  });

  // title 属性の翻訳（data-i18n-title）
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
}

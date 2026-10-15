/* ========================================================================
   i18n.js -- 多言語対応モジュール (ja / en)
   ======================================================================== */

import { STORAGE_KEYS } from './constants.js';

const STORAGE_KEY = STORAGE_KEYS.lang;

const dict = {
  ja: {
    busyOperation: 'ファイルの読込完了後に録画を開始してください。',
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
    responseCompare: "物理応答 A/B 差分",
    responseCompareFile: "比較先の応答archive",
    responseCompareCsv: "差分CSV",
    responseComparePng: "差分PNG",
    responseCompareStatus: "最大 |B−A| = {value} {unit}（節点 {node}, t={time} s）。選択節点 {selected}: B−A = {current} {unit}",
    responseCompareHistory: "節点{id}の応答比較",
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
    chkModeColors: "モードの正負を色分け",
    modeColorLegend: "固有ベクトル鉛直成分 uz/Umax（物理変位ではありません）",
    observationActive: "観察用スロー再生: 画面上の1周期 = {seconds}秒。表示時刻は解析上の時刻です。",
    historyTitle: "節点{id}の物理応答時刻歴",
    spectrumTitle: "選択節点の周波数分析（探索用）",
    spectrumCsv: "PSD CSV",
    spectrumStatus: "Welch PSD: fs={fs} Hz、ナイキスト={nyquist} Hz、Δf={resolution} Hz、Hann窓 {length}点、50%重複、{segments}区間。卓越周波数={peak} Hz（規準判定ではありません）",
    spectrumUnavailable: "周波数分析不可: {reason}",
    spectrumNoPeak: "なし",
    peakMinimum: "最小",
    peakMaximum: "最大",
    envelopeMeaning: "包絡: 各節点の全時刻最大絶対値を未変形面に表示（同一時刻の変形ではありません）",
    undefinedMac: "評価不能",
    samePhase: "同一位相で比較",
    loadCancelledKeep: '取消しました（前回のデータを表示中）',
    alertVideoStop: '動画保存はアニメーション停止中のみ開始できます。',
    btnThemeToDark: '☾ ダークに切替',
    btnThemeToLight: '☀ ライトに切替',
    frameDisplay: 'コマ {k} / {n}',
    habNone: '該当なし（歩行帯 1.5–2.5 Hz・倍音帯 3–7.5 Hz の外）',
    labelSample: 'サンプル',
    btnLoadSample: 'サンプルを読込',
    labelPaste: 'テキストから読込',
    pasteHint: 'legacy モード JSON または応答archive JSON を貼り付けて読み込みます',
    btnLoadPaste: '貼り付けを読込',
    pasteEmpty: 'E_PASTE_EMPTY: 読み込むテキストを入力してください',
    loadSummaryMode: '{nodes} 節点 / {lines} 要素 / {modes} モード / 単位 {unit}',
    loadSummaryResponse: '{nodes} 節点 / {faces} 面 / {times} 時刻 / {quantity} [{unit}]',
    ariaSpeedNumber: '速度（倍）',
    ariaScaleNumber: '倍率',
    ariaWidthUndeformed: '未変形線の太さ',
    ariaWidthDeformed: '変形線の太さ',
    ariaCompareFiles: '比較先のモードデータ（calc YAML + result JSON + manifest）',
    ariaPasteInput: '読み込むテキスト',

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
    displayMeaningResponsePhysical: '物理変位archive: 正規化OFF。床面の高さに変位実値 [m] を加算',
    displayMeaningResponseScalar: '物理応答archive: 速度・加速度は基準床面上の色コンターで表示（高さは変化しません）',
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
      '8. マウスドラッグで回転、右クリックドラッグでパン、スクロールでズームできます。\n' +
      '9. キーボード: Space=再生/停止、←/→=コマ移動、R=時刻リセット（入力欄にフォーカスがある間は無効）。\n' +
      '10. 「節点の確認」でIDを入力するか、3Dビューの節点付近をクリックすると選択できます。応答archiveでは時刻歴・ピーク・PSDを表示します。\n' +
      '11. 「ケース比較・鉛直MAC」「物理応答 A/B 差分」で2ケースを同期視点で比較できます。\n' +
      '12. URLパラメータで初期状態を指定できます（例: ?sample=response_case&mode=2&t=0.01&view=top&lang=en&theme=dark&node=3）。\n' +
      '13. 自動操作用に window.floorModeAnime（load / getState / setMode / setTime / play / stop / selectNode / setView）と body の data-* 属性を公開しています。',
  },
  en: {
    busyOperation: 'Wait for file loading to finish before recording.',
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
    responseCompare: "Physical response A/B difference",
    responseCompareFile: "Comparison response archive",
    responseCompareCsv: "Difference CSV",
    responseComparePng: "Difference PNG",
    responseCompareStatus: "Max |B−A| = {value} {unit} (node {node}, t={time} s). Selected node {selected}: B−A = {current} {unit}",
    responseCompareHistory: "Node {id} response comparison",
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
    chkModeColors: "Color signed mode shape",
    modeColorLegend: "Eigenvector vertical component uz/Umax (not physical displacement)",
    observationActive: "Observation slow motion: {seconds} screen seconds per cycle. Displayed time is analysis time.",
    historyTitle: "Node {id} physical response history",
    spectrumTitle: "Selected-node frequency analysis (exploratory)",
    spectrumCsv: "PSD CSV",
    spectrumStatus: "Welch PSD: fs={fs} Hz, Nyquist={nyquist} Hz, Δf={resolution} Hz, {length}-sample Hann window, 50% overlap, {segments} segments. Dominant frequency={peak} Hz (not a criteria check)",
    spectrumUnavailable: "Frequency analysis unavailable: {reason}",
    spectrumNoPeak: "none",
    peakMinimum: "Minimum",
    peakMaximum: "Maximum",
    envelopeMeaning: "Envelope: per-node maximum absolute values over all times on undeformed geometry (not a simultaneous deformed shape)",
    undefinedMac: "Undefined",
    samePhase: "Same phase comparison",
    loadCancelledKeep: 'Cancelled (showing the previous data)',
    alertVideoStop: 'Video recording can only start while animation is stopped.',
    btnThemeToDark: '☾ Switch to dark',
    btnThemeToLight: '☀ Switch to light',
    frameDisplay: 'Frame {k} / {n}',
    habNone: 'None (outside walking 1.5–2.5 Hz and harmonic 3–7.5 Hz bands)',
    labelSample: 'Sample',
    btnLoadSample: 'Load sample',
    labelPaste: 'Load from text',
    pasteHint: 'Paste a legacy modal JSON or a response archive JSON',
    btnLoadPaste: 'Load pasted text',
    pasteEmpty: 'E_PASTE_EMPTY: enter text to load',
    loadSummaryMode: '{nodes} nodes / {lines} elements / {modes} modes / unit {unit}',
    loadSummaryResponse: '{nodes} nodes / {faces} faces / {times} times / {quantity} [{unit}]',
    ariaSpeedNumber: 'Speed (x)',
    ariaScaleNumber: 'Scale',
    ariaWidthUndeformed: 'Undeformed line width',
    ariaWidthDeformed: 'Deformed line width',
    ariaCompareFiles: 'Comparison modal data (calc YAML + result JSON + manifest)',
    ariaPasteInput: 'Text to load',

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
    displayMeaningResponsePhysical: 'Physical displacement archive: normalization OFF. The displacement [m] is added to floor height.',
    displayMeaningResponseScalar: 'Physical response archive: velocity and acceleration are colored on the base floor (height does not change).',
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
      '8. Mouse drag to rotate, right-click drag to pan, scroll to zoom.\n' +
      '9. Keyboard: Space = play/stop, Left/Right = step, R = reset time (ignored while an input has focus).\n' +
      '10. Select a node by typing its ID under "Inspect node" or by clicking near it in the 3D view. Response archives show history, peaks and PSD.\n' +
      '11. "Compare cases / vertical MAC" and "Physical response A/B difference" compare two cases with a shared camera.\n' +
      '12. URL parameters set the initial state (e.g. ?sample=response_case&mode=2&t=0.01&view=top&lang=en&theme=dark&node=3).\n' +
      '13. For automation, window.floorModeAnime (load / getState / setMode / setTime / play / stop / selectNode / setView) and body data-* attributes are exposed.',
  },
};

/** Localized, action-oriented hints for diagnostic codes (E_/W_ prefix). */
const issueHints = {
  ja: {
    W_FREQ_HIGH: '通常速度では1周期あたり数フレームしか描画されません。「モード観察用再生」で1周期を2秒または4秒にして観察してください。',
    W_UNIT_CONVERTED: 'manifest の指定により座標を mm から m に変換しました。表示・出力は m です。',
    E_FILE_PAIR: 'モデル（*_calc.yaml）と結果（*_result.json）を同時に選択してください。manifest があれば一緒に選びます。',
    E_JSON_PARSE: 'JSON として読めません。内容と拡張子を確認してください。YAML はモデルファイルとしてのみ扱い、単体では読み込めません。',
    E_FILE_AMBIGUOUS: '選択したファイルの組合せが一意に決まりません。不要なファイルを外してください。',
    E_FILE_MIXED: '応答archive は単独で読み込んでください。',
    E_SPECTRUM_SAMPLES: '周波数分析には等間隔で32サンプル以上の時刻歴が必要です。',
    E_SPECTRUM_SPACING: '時刻が等間隔でないため周波数分析はできません。',
    E_SETTINGS_INVALID: '条件JSONが現在のデータと一致しません。同じデータを読み込んでから復元してください。',
    E_NODE_SELECT: '節点ID一覧は「モード形 数値」の表で確認できます。',
    E_COMPARE_NODES: '比較は同じ節点・座標・単位・種別のケースだけに対応します。',
    E_COMPARE_COORDINATES: '比較は同じ節点・座標・単位・種別のケースだけに対応します。',
    E_COMPARE_UNITS: '比較は同じ節点・座標・単位・種別のケースだけに対応します。',
    E_COMPARE_KIND: 'モードデータ同士、応答archive同士でのみ比較できます。',
    E_COMPARE_TIME: '時刻列が一致する応答archiveだけを比較できます（補間はしません）。',
    E_CAPTURE_PLAYING: '停止してから再度実行してください。',
    E_VIDEO_UNSUPPORTED: 'PNG保存をご利用ください。',
    E_FETCH: 'ファイルの URL と CORS 設定を確認してください。',
    E_PASTE_EMPTY: 'テキスト欄に JSON を貼り付けてから押してください。',
  },
  en: {
    W_FREQ_HIGH: 'At normal speed only a few frames are drawn per cycle. Use "Mode observation playback" (2 or 4 seconds per cycle).',
    W_UNIT_CONVERTED: 'Coordinates were converted from mm to m as declared by the manifest. Display and exports use m.',
    E_FILE_PAIR: 'Select the model (*_calc.yaml) and the result (*_result.json) together, plus the manifest if available.',
    E_JSON_PARSE: 'The text is not valid JSON. YAML is only accepted as the model file and cannot be loaded alone.',
    E_FILE_AMBIGUOUS: 'The selected files do not form a unique input. Remove extra files.',
    E_FILE_MIXED: 'Load a response archive on its own.',
    E_SPECTRUM_SAMPLES: 'Frequency analysis needs at least 32 uniformly spaced samples.',
    E_SPECTRUM_SPACING: 'Frequency analysis needs uniformly spaced times.',
    E_SETTINGS_INVALID: 'The settings JSON does not match the loaded data. Load the same data first.',
    E_NODE_SELECT: 'Node IDs are listed in the "Mode Shape Values" table.',
    E_COMPARE_NODES: 'Comparison requires identical node sets, coordinates, units and data kinds.',
    E_COMPARE_COORDINATES: 'Comparison requires identical node sets, coordinates, units and data kinds.',
    E_COMPARE_UNITS: 'Comparison requires identical node sets, coordinates, units and data kinds.',
    E_COMPARE_KIND: 'Compare modal data with modal data, or response archives with response archives.',
    E_COMPARE_TIME: 'Only response archives with identical time samples can be compared (no interpolation).',
    E_CAPTURE_PLAYING: 'Stop playback and try again.',
    E_VIDEO_UNSUPPORTED: 'Use Save PNG instead.',
    E_FETCH: 'Check the file URL and CORS settings.',
    E_PASTE_EMPTY: 'Paste JSON into the text box first.',
  },
};

/**
 * Return a localized hint for a diagnostic message or code, or '' when unknown.
 * @param {string} messageOrCode  e.g. 'W_FREQ_HIGH: freqHz[2]=39.5 > 30 Hz ...'
 * @returns {string}
 */
export function issueHint(messageOrCode) {
  const match = /^([EW]_[A-Z0-9_]+)/.exec(String(messageOrCode ?? '').trim());
  if (!match) return '';
  const table = issueHints[currentLang] || issueHints.ja;
  return table[match[1]] ?? issueHints.ja[match[1]] ?? '';
}

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

  // aria-label 属性の翻訳（data-i18n-aria）
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });

  // 言語に依存する動的表示（警告パネル等）の再描画を依頼する
  if (typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('floor:langchange', { detail: { lang: currentLang } }));
  }
}

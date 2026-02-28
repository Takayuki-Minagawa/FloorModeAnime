/* ========================================================================
   i18n.js -- 多言語対応モジュール (ja / en)
   ======================================================================== */

const STORAGE_KEY = 'floor-mode-lang';

const dict = {
  ja: {
    pageTitle: '床モードアニメ',
    panelTitle: 'コントロール',
    labelMode: 'モード',
    labelTime: '時間',
    labelSpeed: '速度',
    labelScale: '倍率',
    labelVisibility: '表示切替',
    labelLoadJson: 'JSON読込',
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
    chkRefLines: '基準線',
    modeOption: 'モード {n}',
    timeDisplay: 't = {t} s',
    loadingOption: '-- 読込中 --',
    alertPngStop: 'PNG保存はアニメーション停止中のみ実行できます。',
    alertPngFail: 'PNG保存失敗: {msg}',
    alertFileError: 'ファイル読込エラー: {msg}',
    errorJsonParse: 'E_JSON_PARSE: {msg}',
    errorWebGL: 'E_WEBGL: 3D描画の初期化に失敗しました: {msg}',
    errorFetch: 'E_FETCH: サンプルデータの読込に失敗しました: {msg}',
    helpTitle: '使い方',
    helpContent:
      '1. サンプルデータが自動的に読み込まれます。独自のJSONファイルを「JSON読込」から読み込むこともできます。\n' +
      '2. 「モード」ドロップダウンで振動モードを切り替えます。\n' +
      '3. 「再生」で振動アニメーションを開始、「停止」で一時停止します。\n' +
      '4. 「速度」スライダーでアニメーション速度を調整します（0.2x〜2.0x）。\n' +
      '5. 「倍率」スライダーで変形表示のスケールを調整します（0.5〜3.0）。\n' +
      '6. 「表示切替」チェックボックスで各要素の表示/非表示を制御します。\n' +
      '7. アニメーション停止中に「PNG保存」でスクリーンショットを保存できます。\n' +
      '8. マウスドラッグで回転、右クリックドラッグでパン、スクロールでズームできます。',
  },
  en: {
    pageTitle: 'Floor Mode Anime',
    panelTitle: 'Controls',
    labelMode: 'Mode',
    labelTime: 'Time',
    labelSpeed: 'Speed',
    labelScale: 'Scale',
    labelVisibility: 'Visibility',
    labelLoadJson: 'Load JSON',
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
    chkRefLines: 'Ref. Lines',
    modeOption: 'Mode {n}',
    timeDisplay: 't = {t} s',
    loadingOption: '-- loading --',
    alertPngStop: 'PNG can only be saved while animation is stopped.',
    alertPngFail: 'PNG save failed: {msg}',
    alertFileError: 'File read error: {msg}',
    errorJsonParse: 'E_JSON_PARSE: {msg}',
    errorWebGL: 'E_WEBGL: 3D rendering init failed: {msg}',
    errorFetch: 'E_FETCH: Failed to load sample data: {msg}',
    helpTitle: 'How to Use',
    helpContent:
      '1. Sample data loads automatically. You can also load your own JSON via "Load JSON".\n' +
      '2. Use the "Mode" dropdown to switch between vibration modes.\n' +
      '3. Press "Play" to start animation, "Stop" to pause.\n' +
      '4. Adjust animation speed with the "Speed" slider (0.2x - 2.0x).\n' +
      '5. Adjust deformation scale with the "Scale" slider (0.5 - 3.0).\n' +
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
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), v);
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

  const els = document.querySelectorAll('[data-i18n]');
  els.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    // LABELタグで子要素（Element）がある場合はスキップ
    if (el.tagName === 'LABEL' && el.children.length > 0) {
      return;
    }
    el.textContent = t(key);
  });
}

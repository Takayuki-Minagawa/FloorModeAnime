/**
 * constants.js -- プロジェクト共通の定数を集約する。
 *
 * 色・寸法・範囲などのマジックナンバーや、複数モジュールで共有する
 * 値を一箇所に集約し、片側のみ変更による不整合を防ぐ。
 *
 * @module constants
 */

/** 浮動小数比較用イプシロン（CLAUDE.md 規約） */
export const EPS = 1e-9;

/** 2π（角速度計算用） */
export const TWO_PI = 2 * Math.PI;

/** A_ref = L_floor / A_REF_DIVISOR */
export const A_REF_DIVISOR = 10;

/** localStorage キー */
export const STORAGE_KEYS = {
  theme: 'floor-mode-theme',
  lang: 'floor-mode-lang',
};

/** 変形倍率 S の範囲（スライダー・クランプ共通） */
export const SCALE = { MIN: 0.5, MAX: 3.0, DEFAULT: 1.0 };

/** 再生速度倍率の範囲（スライダー・クランプ共通） */
export const SPEED = { MIN: 0.2, MAX: 2.0, DEFAULT: 1.0 };

/** 線スタイル既定値 */
export const LINE_WIDTH = { undeformed: 2, deformed: 3 };

/**
 * テーマ別の色（ライト / ダーク）。
 * loadFloorData / setThemeColors の双方がこれを参照し、色定義の単一ソースとする。
 */
export const THEME = {
  light: {
    clear: 0xffffff,
    undeformed: 0x888888,
    deformed: 0xff4444,
    grid: 0xcccccc,
  },
  dark: {
    clear: 0x1a1a2e,
    undeformed: 0xaaaaaa,
    deformed: 0xff6666,
    grid: 0x444466,
  },
};

/** 3D ビュー（カメラ・グリッド・軸）の調整係数 */
export const VIEW = {
  CAMERA_FOV: 50,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 10000,
  /** カメラ距離 = L_floor * CAMERA_DIST_FACTOR */
  CAMERA_DIST_FACTOR: 1.5,
  /** カメラ位置オフセット係数（dist 倍率） */
  CAMERA_OFFSET: { x: -0.85, y: 0.7, z: 0.4 },
  /** 軸サイズ = L_floor * AXES_SIZE_FACTOR */
  AXES_SIZE_FACTOR: 0.5,
  /** グリッドサイズ = L_floor * GRID_SIZE_FACTOR */
  GRID_SIZE_FACTOR: 1.5,
  GRID_DIVISIONS: 10,
};

/** DOM 要素 ID（タイポ防止のため集約） */
export const DOM_IDS = {
  canvasContainer: 'canvas-container',
  modeSelect: 'mode-select',
  freqDisplay: 'freq-display',
  timeDisplay: 'time-display',
  btnPlay: 'btn-play',
  btnStop: 'btn-stop',
  speedSlider: 'speed-slider',
  speedValue: 'speed-value',
  scaleSlider: 'scale-slider',
  scaleValue: 'scale-value',
  chkUndeformed: 'chk-undeformed',
  chkDeformed: 'chk-deformed',
  chkAxes: 'chk-axes',
  chkGrid: 'chk-grid',
  chkNodeIds: 'chk-node-ids',
  colorUndeformed: 'color-undeformed',
  widthUndeformed: 'width-undeformed',
  widthUndeformedVal: 'width-undeformed-val',
  colorDeformed: 'color-deformed',
  widthDeformed: 'width-deformed',
  widthDeformedVal: 'width-deformed-val',
  btnTheme: 'btn-theme',
  btnLang: 'btn-lang',
  btnDownload: 'btn-download',
  fileInput: 'file-input',
  btnSelectFile: 'btn-select-file',
  fileNameDisplay: 'file-name-display',
  helpContent: 'help-content',
  errorContainer: 'error-container',
};

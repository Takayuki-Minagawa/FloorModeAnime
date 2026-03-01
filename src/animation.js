/**
 * animation.js — u_i(t) 計算・再生/停止・時刻管理
 *
 * 変形表示スケール計算:
 *   A_ref = L_floor / 10
 *   L_floor = max(maxX - minX, maxY - minY)
 *   u_i(t) = S * A_ref * (uz_i,m / Umax_m) * sin(2π f_m t)
 *   z_i'(t) = z_i + u_i(t)
 */

const TWO_PI = 2 * Math.PI;

export class AnimationController {
  /**
   * @param {Object} floorData - parseFloorData の戻り値
   *   { meta, nodes: Map<id,{id,x,y,z}>, lines, freqHz: Map<modeNum,freq>, modes: Map<modeNum,Map<nodeId,uz>> }
   */
  constructor(floorData) {
    this._nodes = floorData.nodes;       // Map<id, {id,x,y,z}>
    this._lines = floorData.lines;       // Array<{id, nodeI, nodeJ}>
    this._freqHz = floorData.freqHz;     // Map<modeNum, freq>
    this._modes = floorData.modes;       // Map<modeNum, Map<nodeId, uz>>

    // L_floor と A_ref を算出
    this._computeFloorMetrics();

    // Umax_m をモードごとに事前計算
    this._umaxMap = new Map(); // Map<modeNum, number>
    for (const [modeNum, modeShape] of this._modes) {
      let umax = 0;
      for (const uz of modeShape.values()) {
        const absUz = Math.abs(uz);
        if (absUz > umax) {
          umax = absUz;
        }
      }
      // 全て0の場合は1として扱う
      this._umaxMap.set(modeNum, umax === 0 ? 1 : umax);
    }

    // 状態初期化
    this._currentMode = null;
    this._scale = 1.0;     // S: 変形倍率
    this._speed = 1.0;     // 再生速度倍率 (0.2〜2.0)
    this._time = 0;        // t [s]
    this._playing = false;

    // 利用可能モード一覧（ソート済み）
    this._modeList = Array.from(this._modes.keys()).sort((a, b) => a - b);

    // 最初のモードがあれば選択（停止状態）
    if (this._modeList.length > 0) {
      this._currentMode = this._modeList[0];
    }
  }

  /**
   * 節点座標から L_floor, A_ref を計算
   */
  _computeFloorMetrics() {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const node of this._nodes.values()) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    this._lFloor = Math.max(rangeX, rangeY);
    if (this._lFloor === 0) this._lFloor = 1; // 全節点が同一座標の場合ゼロ除算を回避
    this._aRef = this._lFloor / 10;
  }

  /**
   * モード切替 → t=0, 停止状態にする
   * @param {number} modeNum
   */
  setMode(modeNum) {
    this._currentMode = modeNum;
    this._time = 0;
    this._playing = false;
  }

  /**
   * 再生開始
   */
  play() {
    if (this._currentMode !== null) {
      this._playing = true;
    }
  }

  /**
   * 停止 (現フレーム保持)
   */
  stop() {
    this._playing = false;
  }

  /**
   * 倍率 S 設定 (0.5〜3.0 をクランプ)
   * @param {number} s
   */
  setScale(s) {
    this._scale = Math.max(0.5, Math.min(3.0, s));
  }

  /**
   * 現在 t [s]
   * @returns {number}
   */
  getTime() {
    return this._time;
  }

  /**
   * 再生中か
   * @returns {boolean}
   */
  isPlaying() {
    return this._playing;
  }

  /**
   * z_i'(t) を返す
   * @param {number} nodeId
   * @returns {number}
   */
  getDisplacedZ(nodeId) {
    const node = this._nodes.get(nodeId);
    if (!node) {
      return 0;
    }

    const z_i = node.z;

    if (this._currentMode === null) {
      return z_i;
    }

    const modeShape = this._modes.get(this._currentMode);
    if (!modeShape) {
      return z_i;
    }

    // 未記載の節点モード値は uz = 0.0 とみなす
    const uz_im = modeShape.has(nodeId) ? modeShape.get(nodeId) : 0.0;
    const umaxM = this._umaxMap.get(this._currentMode);
    const freqM = this._freqHz.get(this._currentMode) || 0;

    // u_i(t) = S * A_ref * (uz_i,m / Umax_m) * sin(2π f_m t)
    const u_i = this._scale * this._aRef * (uz_im / umaxM) * Math.sin(TWO_PI * freqM * this._time);

    return z_i + u_i;
  }

  /**
   * 再生速度倍率を設定 (0.2〜2.0 をクランプ)
   * @param {number} speed
   */
  setSpeed(speed) {
    this._speed = Math.max(0.2, Math.min(2.0, speed));
  }

  /**
   * 再生速度倍率を返す
   * @returns {number}
   */
  getSpeed() {
    return this._speed;
  }

  /**
   * フレーム更新 (再生中のみ t を進める)
   * @param {number} deltaTime - 経過時間 [s]
   */
  update(deltaTime) {
    if (this._playing) {
      this._time += deltaTime * this._speed;
    }
  }

  /**
   * 指定モード（省略時は現在モード）の振動数 [Hz] を返す
   * @param {number} [modeNum]
   * @returns {number}
   */
  getFreqHz(modeNum) {
    if (modeNum === undefined || modeNum === null) {
      modeNum = this._currentMode;
    }
    return this._freqHz.get(modeNum) || 0;
  }

  /**
   * 現在のモード番号
   * @returns {number}
   */
  getCurrentMode() {
    return this._currentMode;
  }

  /**
   * 利用可能モード一覧
   * @returns {Array<number>}
   */
  getModeList() {
    return this._modeList.slice(); // コピーを返す
  }
}

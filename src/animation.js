/**
 * animation.js — u_i(t) 計算・再生/停止・時刻管理
 *
 * 変形表示スケール計算:
 *   A_ref = L_floor / 10
 *   L_floor = max(maxX - minX, maxY - minY)
 *   u_i(t) = S * A_ref * (uz_i,m / Umax_m) * sin(2π f_m t)
 *   z_i'(t) = z_i + u_i(t)
 */

import { TWO_PI, SCALE, SPEED } from './constants.js';
import { computeFloorMetrics } from './geometry.js';

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
    this._phase0 = floorData.phase0 instanceof Map ? floorData.phase0 : new Map(); // Map<modeNum, rad>

    // L_floor と A_ref を算出
    const metrics = computeFloorMetrics(this._nodes);
    this._lFloor = metrics.lFloor;
    this._aRef = metrics.aRef;

    // Umax_m と最大変位節点をモードごとに事前計算
    this._umaxMap = new Map();    // Map<modeNum, number>
    this._maxNodeMap = new Map(); // Map<modeNum, nodeId>
    for (const [modeNum, modeShape] of this._modes) {
      let umax = 0;
      let maxNodeId = null;
      for (const [nodeId, uz] of modeShape) {
        const absUz = Math.abs(uz);
        if (absUz > umax) {
          umax = absUz;
          maxNodeId = nodeId;
        }
      }
      // 全て0の場合は1として扱う
      this._umaxMap.set(modeNum, umax === 0 ? 1 : umax);
      this._maxNodeMap.set(modeNum, maxNodeId);
    }

    // 状態初期化
    this._currentMode = null;
    this._scale = SCALE.DEFAULT;     // S: 変形倍率
    this._speed = SPEED.DEFAULT;     // 再生速度倍率
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
   * 倍率 S 設定 (SCALE.MIN〜SCALE.MAX をクランプ)
   * @param {number} s
   */
  setScale(s) {
    this._scale = Math.max(SCALE.MIN, Math.min(SCALE.MAX, s));
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
    const freqM = this._freqHz.get(this._currentMode) ?? 0;
    const phi0 = this._phase0.get(this._currentMode) ?? 0;

    // u_i(t) = S * A_ref * (uz_i,m / Umax_m) * sin(2π f_m t + φ0)
    const u_i = this._scale * this._aRef * (uz_im / umaxM)
      * Math.sin(TWO_PI * freqM * this._time + phi0);

    return z_i + u_i;
  }

  /**
   * 再生速度倍率を設定 (SPEED.MIN〜SPEED.MAX をクランプ)
   * @param {number} speed
   */
  setSpeed(speed) {
    this._speed = Math.max(SPEED.MIN, Math.min(SPEED.MAX, speed));
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
    return this._freqHz.get(modeNum) ?? 0;
  }

  /**
   * 現在のモード番号
   * @returns {number}
   */
  getCurrentMode() {
    return this._currentMode;
  }

  /**
   * 現在時刻 t [s] を直接設定する（スクラブ・コマ送り用）。
   * 負値は 0 にクランプ。再生状態は変更しない。
   * @param {number} t
   */
  setTime(t) {
    this._time = Math.max(0, Number(t) || 0);
  }

  /**
   * 指定モード（省略時は現在モード）の周期 T = 1/f [s] を返す。
   * f <= 0 の場合は 0 を返す。
   * @param {number} [modeNum]
   * @returns {number}
   */
  getPeriod(modeNum) {
    const freq = this.getFreqHz(modeNum);
    return freq > 0 ? 1 / freq : 0;
  }

  /**
   * 指定モード（省略時は現在モード）の初期位相 φ0 [rad] を返す。
   * @param {number} [modeNum]
   * @returns {number}
   */
  getPhase(modeNum) {
    if (modeNum === undefined || modeNum === null) {
      modeNum = this._currentMode;
    }
    return this._phase0.get(modeNum) ?? 0;
  }

  /**
   * 指定モード（省略時は現在モード）で |uz| が最大の節点 ID を返す。
   * モードが無い場合は null。
   * @param {number} [modeNum]
   * @returns {number|null}
   */
  getMaxNode(modeNum) {
    if (modeNum === undefined || modeNum === null) {
      modeNum = this._currentMode;
    }
    return this._maxNodeMap.get(modeNum) ?? null;
  }

  /**
   * 正規化モード変位 uz_i,m / Umax_m を返す（-1〜1）。
   * 未記載の節点は 0。
   * @param {number} nodeId
   * @param {number} [modeNum]
   * @returns {number}
   */
  getNormalizedUz(nodeId, modeNum) {
    if (modeNum === undefined || modeNum === null) {
      modeNum = this._currentMode;
    }
    const modeShape = this._modes.get(modeNum);
    if (!modeShape) return 0;
    const uz = modeShape.get(nodeId) ?? 0;
    const umax = this._umaxMap.get(modeNum) ?? 1;
    return uz / umax;
  }

  /**
   * 利用可能モード一覧
   * @returns {Array<number>}
   */
  getModeList() {
    return this._modeList.slice(); // コピーを返す
  }

  /**
   * 節点 ID 一覧（昇順）を返す。
   * @returns {Array<number>}
   */
  getNodeIds() {
    return [...this._nodes.keys()].sort((a, b) => a - b);
  }
}

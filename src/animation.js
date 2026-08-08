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

function responseRange(frames) {
  let min = Infinity;
  let max = -Infinity;
  for (const frame of frames) {
    for (const value of frame) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  return min === Infinity ? { min: 0, max: 0 } : { min, max };
}

export class AnimationController {
  /**
   * @param {Object} floorData - parseFloorData の戻り値
   *   { meta, nodes: Map<id,{id,x,y,z}>, lines, freqHz: Map<modeNum,freq>, modes: Map<modeNum,Map<nodeId,uz>> }
   */
  constructor(floorData) {
    this._dataKind = floorData.dataKind ?? 'mode';
    this._nodes = floorData.nodes;       // Map<id, {id,x,y,z}>
    this._lines = floorData.lines;       // Array<{id, nodeI, nodeJ}>
    this._freqHz = floorData.freqHz;     // Map<modeNum, freq>
    this._modes = floorData.modes;       // Map<modeNum, Map<nodeId, uz>>
    this._phase0 = floorData.phase0 instanceof Map ? floorData.phase0 : new Map(); // Map<modeNum, rad>

    // L_floor と A_ref を算出
    const metrics = computeFloorMetrics(this._nodes);
    this._lFloor = metrics.lFloor;
    this._aRef = metrics.aRef;

    // 共通状態初期化
    this._currentMode = null;
    this._scale = SCALE.DEFAULT;
    this._speed = SPEED.DEFAULT;
    this._time = 0;
    this._playing = false;
    this._displayNormalized = true;
    this._modeList = [];
    this._umaxMap = new Map();
    this._maxNodeMap = new Map();

    if (this._dataKind === 'response') {
      const response = floorData.response;
      this._responseTimes = response.times;
      this._responseValues = response.values;
      this._responseNodeOrder = response.nodeOrder;
      this._responseNodeIndex = new Map(
        this._responseNodeOrder.map((nodeId, index) => [nodeId, index]),
      );
      this._responseQuantity = response.quantity;
      this._responseUnit = response.unit;
      const range = responseRange(this._responseValues);
      this._responseMin = range.min;
      this._responseMax = range.max;
      this._responseMaxAbs = Math.max(
        Math.abs(this._responseMin),
        Math.abs(this._responseMax),
        Number.EPSILON,
      );
      this._time = this._responseTimes[0] ?? 0;
      return;
    }

    // Umax_m と最大変位節点をモードごとに事前計算
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
    if (this._dataKind === 'response') return;
    this._currentMode = modeNum;
    this._time = 0;
    this._playing = false;
  }

  /**
   * 再生開始
   */
  play() {
    if (this._dataKind === 'response') {
      if (this._responseTimes.length > 0) {
        const last = this._responseTimes.at(-1);
        if (this._time >= last) this._time = this._responseTimes[0];
        this._playing = true;
      }
    } else if (this._currentMode !== null) {
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

    if (this._dataKind === 'response') {
      return z_i + this.getDisplayOffset(nodeId);
    }

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

  /** 現在の表示倍率を返す。 */
  getScale() {
    return this._scale;
  }

  /** 入力データ種別（mode / response）を返す。 */
  getDataKind() {
    return this._dataKind;
  }

  /**
   * フレーム更新 (再生中のみ t を進める)
   * @param {number} deltaTime - 経過時間 [s]
   */
  update(deltaTime) {
    if (this._playing) {
      this._time += deltaTime * this._speed;
      if (this._dataKind === 'response') {
        const end = this._responseTimes.at(-1) ?? this._time;
        if (this._time >= end) {
          this._time = end;
          this._playing = false;
        }
      }
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
    const value = Number(t);
    if (this._dataKind === 'response') {
      const start = this._responseTimes[0] ?? 0;
      const end = this._responseTimes.at(-1) ?? start;
      this._time = Math.max(start, Math.min(end, Number.isFinite(value) ? value : start));
      return;
    }
    this._time = Math.max(0, value || 0);
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
    if (this._dataKind === 'response') {
      let maxNode = null;
      let maxValue = -1;
      for (const nodeId of this._responseNodeOrder) {
        const value = Math.abs(this.getResponseValue(nodeId));
        if (value > maxValue) {
          maxValue = value;
          maxNode = nodeId;
        }
      }
      return maxNode;
    }
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
    if (this._dataKind === 'response') {
      return this.getResponseValue(nodeId) / this._responseMaxAbs;
    }
    if (modeNum === undefined || modeNum === null) {
      modeNum = this._currentMode;
    }
    const modeShape = this._modes.get(modeNum);
    if (!modeShape) return 0;
    const uz = modeShape.get(nodeId) ?? 0;
    const umax = this._umaxMap.get(modeNum) ?? 1;
    return uz / umax;
  }

  /** Toggle L/10 shape normalization for physical response archives. */
  setDisplayNormalized(enabled) {
    if (this._dataKind === 'response') this._displayNormalized = Boolean(enabled);
  }

  isDisplayNormalized() {
    return this._dataKind === 'response' ? this._displayNormalized : true;
  }

  /** Raw response value at the current time, linearly interpolated. */
  getResponseValue(nodeId) {
    if (this._dataKind !== 'response') return 0;
    const nodeIndex = this._responseNodeIndex.get(nodeId);
    if (nodeIndex === undefined || this._responseTimes.length === 0) return 0;
    const times = this._responseTimes;
    if (this._time <= times[0]) return this._responseValues[0][nodeIndex];
    const lastIndex = times.length - 1;
    if (this._time >= times[lastIndex]) return this._responseValues[lastIndex][nodeIndex];

    let low = 0;
    let high = lastIndex;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (times[mid] <= this._time) low = mid;
      else high = mid;
    }
    const ratio = (this._time - times[low]) / (times[high] - times[low]);
    const first = this._responseValues[low][nodeIndex];
    const second = this._responseValues[high][nodeIndex];
    return first + (second - first) * ratio;
  }

  /** Viewer ordinate: normalized L/10 presentation or exact raw archive value. */
  getDisplayOffset(nodeId) {
    if (this._dataKind !== 'response') {
      const node = this._nodes.get(nodeId);
      return node ? this.getDisplacedZ(nodeId) - node.z : 0;
    }
    const value = this.getResponseValue(nodeId);
    if (!this._displayNormalized) return value;
    return this._scale * this._aRef * (value / this._responseMaxAbs);
  }

  getResponseQuantity() {
    return this._dataKind === 'response' ? this._responseQuantity : null;
  }

  getResponseUnit() {
    return this._dataKind === 'response' ? this._responseUnit : null;
  }

  /** Stable, symmetric archive-wide color range in physical response units. */
  getResponseRange() {
    if (this._dataKind !== 'response') return { min: 0, max: 0 };
    const maxAbs = Math.max(Math.abs(this._responseMin), Math.abs(this._responseMax));
    return { min: -maxAbs, max: maxAbs };
  }

  /** Current frame range in physical response units. */
  getCurrentResponseRange() {
    if (this._dataKind !== 'response') return { min: 0, max: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const nodeId of this._responseNodeOrder) {
      const value = this.getResponseValue(nodeId);
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return min === Infinity ? { min: 0, max: 0 } : { min, max };
  }

  getTimelineRange() {
    if (this._dataKind === 'response') {
      return {
        min: this._responseTimes[0] ?? 0,
        max: this._responseTimes.at(-1) ?? 0,
      };
    }
    return { min: 0, max: this.getPeriod() };
  }

  /** Move to the adjacent archive time sample and stop. */
  stepResponseFrame(direction) {
    if (this._dataKind !== 'response' || this._responseTimes.length === 0) return;
    this.stop();
    if (direction >= 0) {
      const next = this._responseTimes.find((time) => time > this._time + Number.EPSILON);
      this.setTime(next ?? this._responseTimes.at(-1));
    } else {
      const previous = [...this._responseTimes]
        .reverse()
        .find((time) => time < this._time - Number.EPSILON);
      this.setTime(previous ?? this._responseTimes[0]);
    }
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

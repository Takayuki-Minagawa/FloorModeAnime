/**
 * assessment.js -- 居住性評価（歩行加振・共振）の一次スクリーニング
 *
 * 床の固有振動数を歩行加振帯（およびその倍音帯）と比較し、
 * 共振リスクの有無を簡易判定する。実務の本格評価
 * （AIJ 居住性評価指針 / ISO 10137 / SCI P354 等）の代替ではなく、
 * あくまで「着目すべきモードの目安」を示す一次スクリーニング。
 *
 * @module assessment
 */

import { WALKING } from './constants.js';

/** 共振リスク区分 */
export const RISK = {
  HIGH: 'high',   // 歩行第1次加振帯に該当
  MEDIUM: 'medium', // 歩行倍音帯に該当
  LOW: 'low',     // いずれの加振帯にも該当しない
};

/**
 * 振動数が帯 [min, max] に含まれるか（端点を含む）。
 * @param {number} f
 * @param {{min:number, max:number}} band
 * @returns {boolean}
 */
function inBand(f, band) {
  return f >= band.min && f <= band.max;
}

/**
 * 単一振動数に対する共振リスクを評価する。
 *
 * @param {number} freqHz  固有振動数 [Hz]
 * @returns {{ risk: string, band: string|null }}
 *   risk: RISK.HIGH | RISK.MEDIUM | RISK.LOW
 *   band: 該当した加振帯の説明（該当なしは null）
 */
export function assessFrequency(freqHz) {
  if (!(typeof freqHz === 'number') || !Number.isFinite(freqHz) || freqHz <= 0) {
    return { risk: RISK.LOW, band: null };
  }

  if (inBand(freqHz, WALKING.primary)) {
    return { risk: RISK.HIGH, band: `${WALKING.primary.min}-${WALKING.primary.max} Hz (walking)` };
  }

  for (const band of WALKING.harmonics) {
    if (inBand(freqHz, band)) {
      return { risk: RISK.MEDIUM, band: `${band.min}-${band.max} Hz (harmonic)` };
    }
  }

  return { risk: RISK.LOW, band: null };
}

/**
 * モード別振動数マップを評価する。
 *
 * @param {Map<number, number>} freqHzMap  Map<modeNum, freq>
 * @returns {Array<{ mode:number, freqHz:number, risk:string, band:string|null }>}
 *   モード番号昇順
 */
export function assessModes(freqHzMap) {
  const result = [];
  if (!(freqHzMap instanceof Map)) return result;

  const modes = [...freqHzMap.keys()].sort((a, b) => a - b);
  for (const mode of modes) {
    const freqHz = freqHzMap.get(mode);
    const { risk, band } = assessFrequency(freqHz);
    result.push({ mode, freqHz, risk, band });
  }
  return result;
}

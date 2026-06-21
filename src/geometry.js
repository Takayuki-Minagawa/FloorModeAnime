/**
 * geometry.js -- 座標計算ユーティリティ
 *
 * 節点バウンディングボックスからの L_floor / A_ref 算出と、
 * データ座標系 → three.js 座標系のマッピングを一元管理する。
 * これらは従来 animation.js と viewer.js に重複していた。
 *
 * 座標系（CLAUDE.md, 右手系）:
 *   data.y → three.x（Node1→4方向）
 *   data.z → three.y（鉛直上向き）
 *   data.x → three.z（Node1→2方向）
 *
 * @module geometry
 */

import { A_REF_DIVISOR } from './constants.js';

/**
 * 節点群のバウンディングボックス・中心・L_floor・A_ref を計算する。
 *
 * L_floor = max(maxX - minX, maxY - minY)（CLAUDE.md 規約）
 * A_ref   = L_floor / A_REF_DIVISOR
 * 全節点が同一座標で L_floor=0 のときはゼロ除算回避のため 1 とする。
 *
 * @param {Map<number,{x:number,y:number,z:number}>} nodes
 * @returns {{
 *   minX:number, maxX:number, minY:number, maxY:number, minZ:number, maxZ:number,
 *   centerX:number, centerY:number, centerZ:number,
 *   lFloor:number, aRef:number
 * }}
 */
export function computeFloorMetrics(nodes) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const node of nodes.values()) {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
    if (node.z < minZ) minZ = node.z;
    if (node.z > maxZ) maxZ = node.z;
  }

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  let lFloor = Math.max(rangeX, rangeY);
  if (lFloor === 0) lFloor = 1; // 全節点が同一座標の場合ゼロ除算を回避

  return {
    minX, maxX, minY, maxY, minZ, maxZ,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
    lFloor,
    aRef: lFloor / A_REF_DIVISOR,
  };
}

/**
 * データ座標 (x, y, z) を three.js 座標配列 [x', y', z'] に変換する。
 * data.y → three.x, data.z → three.y, data.x → three.z
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {[number, number, number]}
 */
export function toThree(x, y, z) {
  return [y, z, x];
}

/**
 * three.js オブジェクトの position をデータ座標から設定する。
 * @param {{position:{set:(x:number,y:number,z:number)=>void}}} obj
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function setThreePosition(obj, x, y, z) {
  obj.position.set(y, z, x);
}

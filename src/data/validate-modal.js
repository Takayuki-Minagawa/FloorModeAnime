import { EPS } from '../constants.js';
import { pushError, pushWarning } from './validation-issues.js';

/**
 * parseFloorData の戻り値を検証し、エラー・警告を返す。
 *
 * @param {{ nodes: Map, nodeIdCounts?: Map, lines: Array, freqHz: Map, modes: Map }} data
 * @returns {{ errors: Array<{code:string,message:string}>, warnings: Array<{code:string,message:string}> }}
 */
export function validateModalFloorData(data = {}) {

  const {
    nodes,
    nodeIdCounts,
    lines,
    freqHz,
    modes,
    modesFull,
    phase0,
    contract,
  } = data;
  const errors = [];
  const warnings = [];
  let limitReached;

  // parser/manifest 層で収集した契約違反を先頭へ統合する。
  for (const item of contract?.errors ?? []) {
    limitReached = pushError(errors, item.code, item.message);
    if (limitReached) return { errors, warnings };
  }
  for (const item of contract?.warnings ?? []) {
    pushWarning(warnings, item.code, item.message);
  }

  // =========================================================================
  // 必須キー不足チェック
  // =========================================================================
  const requiredKeys = { nodes, lines, freqHz, modes };
  let missingRequired = false;
  for (const [key, val] of Object.entries(requiredKeys)) {
    if (val === undefined || val === null) {
      missingRequired = true;
      limitReached = pushError(errors, 'E_MISSING_KEY', `required key "${key}" is missing`);
      if (limitReached) return { errors, warnings };
    }
  }

  // 必須キーが 1 つでも欠けていたらこれ以上のチェックは不可
  if (missingRequired) {
    return { errors, warnings };
  }

  // =========================================================================
  // nodes チェック
  // =========================================================================
  if (!(nodes instanceof Map) || nodes.size === 0) {
    limitReached = pushError(errors, 'E_NODES_EMPTY', 'nodes is empty');
    if (limitReached) return { errors, warnings };
  }

  // nodes.id / 座標値チェック
  if (nodes instanceof Map) {
    for (const [id, node] of nodes) {
      if (!Number.isInteger(id) || id <= 0) {
        limitReached = pushError(errors, 'E_NODE_ID_INVALID', `node id=${id} must be a positive integer`);
        if (limitReached) return { errors, warnings };
      }

      if (!node || typeof node !== 'object') {
        limitReached = pushError(errors, 'E_NODE_INVALID', `nodes[${id}] is not an object`);
        if (limitReached) return { errors, warnings };
        continue;
      }

      for (const axis of ['x', 'y', 'z']) {
        const value = node[axis];
        if (typeof value !== 'number' || Number.isNaN(value)) {
          limitReached = pushError(
            errors,
            'E_NODE_COORD_INVALID',
            `nodes[${id}].${axis}=${value} is not a valid number`,
          );
          if (limitReached) return { errors, warnings };
        } else if (!Number.isFinite(value)) {
          limitReached = pushError(
            errors,
            'E_NODE_COORD_INVALID',
            `nodes[${id}].${axis}=${value} must be finite`,
          );
          if (limitReached) return { errors, warnings };
        }
      }
    }
  }

  // nodes.id 重複チェック（parser が返す nodeIdCounts を優先）
  if (nodeIdCounts instanceof Map) {
    for (const [id, count] of nodeIdCounts) {
      if (count > 1) {
        limitReached = pushError(errors, 'E_NODE_DUPLICATE', `node id=${id} is duplicated (${count} entries)`);
        if (limitReached) return { errors, warnings };
      }
    }
  } else if (nodes instanceof Map) {
    const seenNodeIds = new Set();
    for (const id of nodes.keys()) {
      if (seenNodeIds.has(id)) {
        limitReached = pushError(errors, 'E_NODE_DUPLICATE', `node id=${id} is duplicated`);
        if (limitReached) return { errors, warnings };
      }
      seenNodeIds.add(id);
    }
  }

  // =========================================================================
  // lines チェック
  // =========================================================================
  if (!Array.isArray(lines) || lines.length === 0) {
    limitReached = pushError(errors, 'E_LINES_EMPTY', 'lines is empty');
    if (limitReached) return { errors, warnings };
  }

  if (Array.isArray(lines)) {
    const seenLineIds = new Set();
    const connectedNodeIds = new Set();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!Number.isInteger(line.id) || line.id <= 0) {
        limitReached = pushError(
          errors,
          'E_LINE_ID_INVALID',
          `lines[${i}].id=${line.id} must be a positive integer`,
        );
        if (limitReached) return { errors, warnings };
      }

      // lines.id 重複
      if (seenLineIds.has(line.id)) {
        limitReached = pushError(errors, 'E_LINE_DUPLICATE', `lines[${i}].id=${line.id} is duplicated`);
        if (limitReached) return { errors, warnings };
      }
      seenLineIds.add(line.id);
      connectedNodeIds.add(line.nodeI);
      connectedNodeIds.add(line.nodeJ);

      // 未定義節点参照
      if (nodes instanceof Map) {
        if (!nodes.has(line.nodeI)) {
          limitReached = pushError(
            errors,
            'E_LINE_NODE_UNDEF',
            `lines[${i}].nodeI=${line.nodeI} is not defined in nodes`,
          );
          if (limitReached) return { errors, warnings };
        }
        if (!nodes.has(line.nodeJ)) {
          limitReached = pushError(
            errors,
            'E_LINE_NODE_UNDEF',
            `lines[${i}].nodeJ=${line.nodeJ} is not defined in nodes`,
          );
          if (limitReached) return { errors, warnings };
        }
      }

      // 自己ループ
      if (line.nodeI === line.nodeJ) {
        limitReached = pushError(
          errors,
          'E_LINE_SELF_LOOP',
          `lines[${i}].id=${line.id} has self-loop (nodeI === nodeJ = ${line.nodeI})`,
        );
        if (limitReached) return { errors, warnings };
      }
    }

    // manifest が接続契約を宣言した場合、孤立節点を推定で許容しない。
    if (contract && nodes instanceof Map) {
      for (const nodeId of nodes.keys()) {
        if (!connectedNodeIds.has(nodeId)) {
          limitReached = pushError(
            errors,
            'E_NODE_ISOLATED',
            `node id=${nodeId} is not referenced by any line`,
          );
          if (limitReached) return { errors, warnings };
        }
      }
    }
  }

  // =========================================================================
  // freqHz チェック
  // =========================================================================
  if (freqHz instanceof Map) {
    for (const [modeNum, freq] of freqHz) {
      if (!Number.isInteger(modeNum) || modeNum <= 0) {
        limitReached = pushError(
          errors,
          'E_MODE_ID_INVALID',
          `freqHz mode id=${modeNum} must be a positive integer`,
        );
        if (limitReached) return { errors, warnings };
      }
      if (typeof freq !== 'number' || Number.isNaN(freq)) {
        limitReached = pushError(
          errors,
          'E_FREQ_NAN',
          `freqHz[${modeNum}]=${freq} is NaN`,
        );
        if (limitReached) return { errors, warnings };
      } else if (!Number.isFinite(freq)) {
        limitReached = pushError(
          errors,
          'E_FREQ_INFINITY',
          `freqHz[${modeNum}]=${freq} is Infinity`,
        );
        if (limitReached) return { errors, warnings };
      } else if (freq <= 0) {
        limitReached = pushError(
          errors,
          'E_FREQ_NON_POSITIVE',
          `freqHz[${modeNum}]=${freq} must be > 0`,
        );
        if (limitReached) return { errors, warnings };
      }

      // 警告: 高周波
      if (Number.isFinite(freq) && freq > 30) {
        pushWarning(
          warnings,
          'W_FREQ_HIGH',
          `freqHz[${modeNum}]=${freq} > 30 Hz may reduce visual clarity`,
        );
      }
    }
  }

  // =========================================================================
  // modes ↔ freqHz モード番号一致チェック
  // =========================================================================
  if (modes instanceof Map && freqHz instanceof Map) {
    for (const modeNum of modes.keys()) {
      if (!freqHz.has(modeNum)) {
        limitReached = pushError(
          errors,
          'E_MODE_FREQ_MISMATCH',
          `modes has mode ${modeNum} but freqHz does not`,
        );
        if (limitReached) return { errors, warnings };
      }
    }
    for (const modeNum of freqHz.keys()) {
      if (!modes.has(modeNum)) {
        limitReached = pushError(
          errors,
          'E_MODE_FREQ_MISMATCH',
          `freqHz has mode ${modeNum} but modes does not`,
        );
        if (limitReached) return { errors, warnings };
      }
    }
  }

  // =========================================================================
  // modes 節点参照 / uz 値チェック
  // =========================================================================
  if (modes instanceof Map && nodes instanceof Map) {
    for (const [modeNum, uzMap] of modes) {
      if (!Number.isInteger(modeNum) || modeNum <= 0) {
        limitReached = pushError(
          errors,
          'E_MODE_ID_INVALID',
          `modes mode id=${modeNum} must be a positive integer`,
        );
        if (limitReached) return { errors, warnings };
      }
      if (!(uzMap instanceof Map)) continue;

      let allZero = true;

      for (const [nodeId, uz] of uzMap) {
        // 未定義節点参照
        if (!nodes.has(nodeId)) {
          limitReached = pushError(
            errors,
            'E_MODE_NODE_UNDEF',
            `modes[${modeNum}] references undefined node ${nodeId}`,
          );
          if (limitReached) return { errors, warnings };
        }

        // uz が NaN
        if (typeof uz !== 'number' || Number.isNaN(uz)) {
          limitReached = pushError(
            errors,
            'E_UZ_NAN',
            `modes[${modeNum}][${nodeId}] uz is NaN`,
          );
          if (limitReached) return { errors, warnings };
        } else if (!Number.isFinite(uz)) {
          // uz が Infinity
          limitReached = pushError(
            errors,
            'E_UZ_INFINITY',
            `modes[${modeNum}][${nodeId}] uz is Infinity`,
          );
          if (limitReached) return { errors, warnings };
        } else if (Math.abs(uz) > EPS) {
          allZero = false;
        }
      }

      // 警告: 全節点 uz ≈ 0
      if (allZero && uzMap.size > 0) {
        pushWarning(
          warnings,
          'W_MODE_ALL_ZERO',
          `modes[${modeNum}] all uz values are zero (|uz| <= ${EPS})`,
        );
      }
    }
  }

  // manifest 付き解析結果は full DOF 値を正本とするため、uz 以外も finite 検査する。
  if (contract && modesFull instanceof Map) {
    for (const [modeNum, nodeValues] of modesFull) {
      if (!(nodeValues instanceof Map)) {
        limitReached = pushError(
          errors,
          'E_MODE_SHAPE_FULL_INVALID',
          `modesFull[${modeNum}] must be a Map`,
        );
        if (limitReached) return { errors, warnings };
        continue;
      }
      for (const [nodeId, dofValues] of nodeValues) {
        for (const [dof, value] of Object.entries(dofValues ?? {})) {
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            limitReached = pushError(
              errors,
              'E_MODE_SHAPE_NONFINITE',
              `modesFull[${modeNum}][${nodeId}].${dof}=${value} must be finite`,
            );
            if (limitReached) return { errors, warnings };
          }
        }
      }
    }
  }

  // =========================================================================
  // phase0 チェック（任意フィールド。存在する場合のみ）
  // =========================================================================
  if (phase0 instanceof Map) {
    for (const [modeNum, phi] of phase0) {
      if (typeof phi !== 'number' || Number.isNaN(phi) || !Number.isFinite(phi)) {
        limitReached = pushError(
          errors,
          'E_PHASE0_INVALID',
          `phase0[${modeNum}]=${phi} is not a finite number`,
        );
        if (limitReached) return { errors, warnings };
      }
      // モード番号が modes に存在しない phase0 は警告（無視される）
      if (modes instanceof Map && !modes.has(modeNum)) {
        pushWarning(
          warnings,
          'W_PHASE0_UNKNOWN_MODE',
          `phase0 has mode ${modeNum} but modes does not; it will be ignored`,
        );
      }
    }
  }

  // =========================================================================
  // 警告: 節点 z が混在（全 z が同一でない場合）
  // =========================================================================
  if (nodes instanceof Map && nodes.size > 0) {
    const zValues = [...nodes.values()].map((n) => n.z);
    const firstZ = zValues[0];
    const mixed = zValues.some((z) => Math.abs(z - firstZ) > EPS);
    if (mixed) {
      pushWarning(
        warnings,
        'W_NODE_Z_MIXED',
        'node z-coordinates are not uniform; floor may not be planar',
      );
    }
  }

  return { errors, warnings };
}

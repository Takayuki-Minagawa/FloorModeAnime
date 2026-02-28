/**
 * validator.js -- 構造整合チェック・エラー収集
 *
 * @module validator
 */

/** 浮動小数比較用イプシロン */
const EPS = 1e-9;

/** 収集するエラーの上限 */
const MAX_ERRORS = 100;

/**
 * エラーを収集配列に追加する（上限チェック付き）。
 * @param {Array<{code:string, message:string}>} list
 * @param {string} code
 * @param {string} message
 * @returns {boolean} 上限に達した場合 true
 */
function pushError(list, code, message) {
  if (list.length >= MAX_ERRORS) return true;
  list.push({ code, message: `${code}: ${message}` });
  return list.length >= MAX_ERRORS;
}

/**
 * 警告を収集配列に追加する。
 * @param {Array<{code:string, message:string}>} list
 * @param {string} code
 * @param {string} message
 */
function pushWarning(list, code, message) {
  list.push({ code, message: `${code}: ${message}` });
}

/**
 * parseFloorData の戻り値を検証し、エラー・警告を返す。
 *
 * @param {{ nodes: Map, lines: Array, freqHz: Map, modes: Map }} data
 * @returns {{ errors: Array<{code:string,message:string}>, warnings: Array<{code:string,message:string}> }}
 */
export function validateFloorData({ nodes, lines, freqHz, modes } = {}) {
  const errors = [];
  const warnings = [];
  let limitReached;

  // =========================================================================
  // 必須キー不足チェック
  // =========================================================================
  const requiredKeys = { nodes, lines, freqHz, modes };
  for (const [key, val] of Object.entries(requiredKeys)) {
    if (val === undefined || val === null) {
      limitReached = pushError(errors, 'E_MISSING_KEY', `required key "${key}" is missing`);
      if (limitReached) return { errors, warnings };
    }
  }

  // 必須キーが 1 つでも欠けていたらこれ以上のチェックは不可
  if (errors.length > 0) {
    return { errors, warnings };
  }

  // =========================================================================
  // nodes チェック
  // =========================================================================
  if (!(nodes instanceof Map) || nodes.size === 0) {
    limitReached = pushError(errors, 'E_NODES_EMPTY', 'nodes is empty');
    if (limitReached) return { errors, warnings };
  }

  // nodes.id 重複チェック（Map なので本来重複しないが、念のため走査）
  if (nodes instanceof Map) {
    const seenNodeIds = new Set();
    let idx = 0;
    for (const [id] of nodes) {
      if (seenNodeIds.has(id)) {
        limitReached = pushError(errors, 'E_NODE_DUPLICATE', `nodes[${idx}].id=${id} is duplicated`);
        if (limitReached) return { errors, warnings };
      }
      seenNodeIds.add(id);
      idx++;
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
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // lines.id 重複
      if (seenLineIds.has(line.id)) {
        limitReached = pushError(errors, 'E_LINE_DUPLICATE', `lines[${i}].id=${line.id} is duplicated`);
        if (limitReached) return { errors, warnings };
      }
      seenLineIds.add(line.id);

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
  }

  // =========================================================================
  // freqHz チェック
  // =========================================================================
  if (freqHz instanceof Map) {
    for (const [modeNum, freq] of freqHz) {
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

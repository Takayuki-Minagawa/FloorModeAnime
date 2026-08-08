/**
 * validator.js -- 構造整合チェック・エラー収集
 *
 * @module validator
 */

import { EPS } from './constants.js';

/** 収集するエラーの上限 */
const MAX_ERRORS = 100;

/**
 * `E_XXX_YYY: 説明` 形式のメッセージ項目を生成する（CLAUDE.md 規約）。
 * @param {string} code
 * @param {string} message
 * @returns {{code:string, message:string}}
 */
function formatItem(code, message) {
  return { code, message: `${code}: ${message}` };
}

/**
 * エラーを収集配列に追加する（上限チェック付き）。
 * @param {Array<{code:string, message:string}>} list
 * @param {string} code
 * @param {string} message
 * @returns {boolean} 上限に達した場合 true
 */
function pushError(list, code, message) {
  if (list.length >= MAX_ERRORS) return true;
  list.push(formatItem(code, message));
  return list.length >= MAX_ERRORS;
}

/**
 * 警告を収集配列に追加する。
 * @param {Array<{code:string, message:string}>} list
 * @param {string} code
 * @param {string} message
 */
function pushWarning(list, code, message) {
  list.push(formatItem(code, message));
}

const RESPONSE_UNITS = {
  vertical_displacement: 'm',
  vertical_velocity: 'm/s',
  vertical_acceleration: 'm/s^2',
};

function validateResponseFloorData(data) {
  const errors = [];
  const warnings = [];
  const { nodes, nodeIdCounts, lines, faces, response } = data;
  let limitReached;

  const add = (code, message) => {
    limitReached = pushError(errors, code, message);
    return limitReached;
  };

  if (!(nodes instanceof Map) || nodes.size === 0) {
    add('E_NODES_EMPTY', 'nodes is empty');
  } else {
    for (const [id, node] of nodes) {
      if (!Number.isInteger(id) || id <= 0) {
        if (add('E_NODE_ID_INVALID', `node id=${id} must be a positive integer`)) break;
      }
      for (const axis of ['x', 'y', 'z']) {
        if (typeof node?.[axis] !== 'number' || !Number.isFinite(node[axis])) {
          if (add('E_NODE_COORD_INVALID', `nodes[${id}].${axis}=${node?.[axis]} must be finite`)) break;
        }
      }
    }
  }
  if (nodeIdCounts instanceof Map) {
    for (const [id, count] of nodeIdCounts) {
      if (count > 1 && add('E_NODE_DUPLICATE', `node id=${id} is duplicated (${count} entries)`)) {
        break;
      }
    }
  }

  const connected = new Set();
  if (!Array.isArray(lines) || lines.length === 0) {
    add('E_LINES_EMPTY', 'response archive has no lines or derivable face edges');
  } else {
    const lineIds = new Set();
    lines.forEach((line, index) => {
      if (!Number.isInteger(line.id) || line.id <= 0) {
        add('E_LINE_ID_INVALID', `lines[${index}].id=${line.id} must be a positive integer`);
      }
      if (lineIds.has(line.id)) add('E_LINE_DUPLICATE', `lines[${index}].id=${line.id} is duplicated`);
      lineIds.add(line.id);
      connected.add(line.nodeI);
      connected.add(line.nodeJ);
      if (!nodes?.has(line.nodeI) || !nodes?.has(line.nodeJ)) {
        add('E_LINE_NODE_UNDEF', `lines[${index}] references an undefined node`);
      }
      if (line.nodeI === line.nodeJ) add('E_LINE_SELF_LOOP', `lines[${index}] is a self-loop`);
    });
  }

  if (!Array.isArray(faces) || faces.length === 0) {
    add('E_RESPONSE_FACES_EMPTY', 'faces must be a non-empty array for contour display');
  } else {
    const faceIds = new Set();
    faces.forEach((face, index) => {
      if (!Number.isInteger(face.id) || face.id <= 0) {
        add('E_FACE_ID_INVALID', `faces[${index}].id=${face.id} must be a positive integer`);
      }
      if (faceIds.has(face.id)) add('E_FACE_DUPLICATE', `faces[${index}].id=${face.id} is duplicated`);
      faceIds.add(face.id);
      if (!Array.isArray(face.nodeIds) || face.nodeIds.length < 3) {
        add('E_FACE_SIZE', `faces[${index}] must contain at least 3 node IDs`);
        return;
      }
      if (new Set(face.nodeIds).size !== face.nodeIds.length) {
        add('E_FACE_NODE_DUPLICATE', `faces[${index}] contains a repeated node ID`);
      }
      for (const nodeId of face.nodeIds) {
        connected.add(nodeId);
        if (!nodes?.has(nodeId)) add('E_FACE_NODE_UNDEF', `faces[${index}] references node ${nodeId}`);
      }
    });
  }
  if (nodes instanceof Map) {
    for (const id of nodes.keys()) {
      if (!connected.has(id)) add('E_NODE_ISOLATED', `node id=${id} is not connected to a line or face`);
    }
  }

  if (!response || typeof response !== 'object') {
    add('E_RESPONSE_MISSING', 'response archive payload is missing');
    return { errors, warnings };
  }
  if (response.schemaVersion !== 'floor-response-archive/1') {
    add('E_RESPONSE_SCHEMA', 'schema_version must be floor-response-archive/1');
  }
  if (response.units?.length !== 'm' || response.units?.time !== 's') {
    add('E_RESPONSE_UNITS', 'response archive must use length=m and time=s');
  }
  const expectedUnit = RESPONSE_UNITS[response.quantity];
  if (!expectedUnit) {
    add('E_RESPONSE_QUANTITY', `quantity=${response.quantity} is unsupported`);
  } else if (response.unit !== expectedUnit) {
    add('E_RESPONSE_UNITS', `${response.quantity} must use response unit ${expectedUnit}`);
  }
  const rightHanded = response.coordinates?.rightHanded === true
    || response.coordinates?.handedness === 'right';
  if (!rightHanded || response.coordinates?.verticalAxis !== 'z') {
    add('E_RESPONSE_COORDINATES', 'coordinates must be right-handed with vertical_axis=z');
  }
  if (response.normalization !== 'physical') {
    add('E_RESPONSE_NORMALIZATION', 'response archive normalization must be physical');
  } else if (typeof response.normalizationReference !== 'string'
    || response.normalizationReference.trim() === '') {
    add('E_RESPONSE_NORMALIZATION', 'physical normalization reference is required');
  }
  if (!response.provenance || typeof response.provenance !== 'object'
    || Object.keys(response.provenance).length === 0) {
    add('E_RESPONSE_PROVENANCE', 'response archive provenance is required');
  }

  const expectedOrder = nodes instanceof Map ? [...nodes.keys()] : [];
  if (!Array.isArray(response.nodeOrder) || response.nodeOrder.length === 0) {
    add('E_RESPONSE_NODE_ORDER', 'node_order must be a non-empty array');
  } else if (response.nodeOrder.length !== expectedOrder.length
    || response.nodeOrder.some((id, index) => id !== expectedOrder[index])) {
    add('E_RESPONSE_NODE_ORDER', 'node_order must exactly match nodes array order');
  } else if (new Set(response.nodeOrder).size !== response.nodeOrder.length) {
    add('E_RESPONSE_NODE_ORDER', 'node_order contains duplicate IDs');
  }

  if (!Array.isArray(response.times) || response.times.length === 0) {
    add('E_RESPONSE_TIME_EMPTY', 'time_s must be a non-empty array');
  } else {
    response.times.forEach((time, index) => {
      if (typeof time !== 'number' || !Number.isFinite(time)) {
        add('E_RESPONSE_TIME_NONFINITE', `time_s[${index}]=${time} must be finite`);
      }
      if (index > 0 && !(time - response.times[index - 1] > EPS)) {
        add('E_RESPONSE_TIME_ORDER', 'time_s must be strictly increasing');
      }
    });
  }

  if (!Array.isArray(response.values) || response.values.length === 0) {
    add('E_RESPONSE_VALUES_EMPTY', 'response_values must be a non-empty array');
  } else {
    if (response.values.length !== response.times?.length) {
      add('E_RESPONSE_DIMENSION', 'response_values row count must equal time_s length');
    }
    response.values.forEach((frame, frameIndex) => {
      if (!Array.isArray(frame) || frame.length !== response.nodeOrder?.length) {
        add('E_RESPONSE_DIMENSION', `response_values[${frameIndex}] length must equal node_order`);
        return;
      }
      frame.forEach((value, nodeIndex) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          add(
            'E_RESPONSE_VALUE_NONFINITE',
            `response_values[${frameIndex}][${nodeIndex}]=${value} must be finite`,
          );
        }
      });
    });
  }

  return { errors: errors.slice(0, MAX_ERRORS), warnings };
}

/**
 * parseFloorData の戻り値を検証し、エラー・警告を返す。
 *
 * @param {{ nodes: Map, nodeIdCounts?: Map, lines: Array, freqHz: Map, modes: Map }} data
 * @returns {{ errors: Array<{code:string,message:string}>, warnings: Array<{code:string,message:string}> }}
 */
export function validateFloorData(data = {}) {
  if (data.dataKind === 'response') return validateResponseFloorData(data);

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

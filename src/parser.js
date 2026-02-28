/**
 * parser.js -- JSON読込・型変換・既定値適用
 *
 * @module parser
 */

/**
 * snake_case / kebab-case のキーを camelCase に変換する。
 * 例: "node_i" -> "nodeI", "freq_hz" -> "freqHz"
 * @param {string} key
 * @returns {string}
 */
function toCamelCase(key) {
  return key.replace(/[_-]([a-z0-9])/gi, (_, ch) => ch.toUpperCase());
}

/**
 * オブジェクト / 配列を再帰的に走査し、全キーを camelCase に変換する。
 * @param {*} value
 * @returns {*}
 */
function convertKeysToCamelCase(value) {
  if (Array.isArray(value)) {
    return value.map(convertKeysToCamelCase);
  }
  if (value !== null && typeof value === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[toCamelCase(k)] = convertKeysToCamelCase(v);
    }
    return result;
  }
  return value;
}

/**
 * JSON 文字列をパースし、床構面データ構造に変換する。
 *
 * @param {string} jsonString  入力 JSON 文字列
 * @returns {{
 *   meta: object,
 *   nodes: Map<number,{id:number,x:number,y:number,z:number}>,
 *   nodeIdCounts: Map<number,number>,
 *   lines: Array<{id:number,nodeI:number,nodeJ:number}>,
 *   freqHz: Map<number,number>,
 *   modes: Map<number,Map<number,number>>
 * }}
 * @throws {Error} JSON パースに失敗した場合
 */
export function parseFloorData(jsonString) {
  // --- 1. JSON パース -------------------------------------------------------
  let raw;
  try {
    raw = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`JSON parse error: ${e.message}`, { cause: e });
  }

  // --- 2. キー名を camelCase に変換 -----------------------------------------
  const data = convertKeysToCamelCase(raw);

  // --- 3. meta --------------------------------------------------------------
  const meta = data.meta ?? {};

  // --- 4. nodes → Map<id, {id, x, y, z}> -----------------------------------
  const nodes = new Map();
  const nodeIdCounts = new Map();
  if (Array.isArray(data.nodes)) {
    for (const n of data.nodes) {
      const id = Number(n.id);
      const x = Number(n.x ?? 0);
      const y = Number(n.y ?? 0);
      const z = Number(n.z ?? 0);
      nodeIdCounts.set(id, (nodeIdCounts.get(id) ?? 0) + 1);
      nodes.set(id, { id, x, y, z });
    }
  }

  // --- 5. lines → Array<{id, nodeI, nodeJ}> ---------------------------------
  const lines = [];
  if (Array.isArray(data.lines)) {
    for (const l of data.lines) {
      lines.push({
        id: Number(l.id),
        nodeI: Number(l.nodeI),
        nodeJ: Number(l.nodeJ),
      });
    }
  }

  // --- 6. freqHz → Map<modeNum, freq> ---------------------------------------
  const freqHz = new Map();
  if (data.freqHz && typeof data.freqHz === 'object') {
    for (const [key, val] of Object.entries(data.freqHz)) {
      const modeNum = Number(key);
      const freq = Number(val);
      freqHz.set(modeNum, freq);
    }
  }

  // --- 7. modes → Map<modeNum, Map<nodeId, uz>> -----------------------------
  //    未記載の節点は uz = 0.0 とみなす（ここでは全 nodes を埋める）
  const modes = new Map();
  if (data.modes && typeof data.modes === 'object') {
    for (const [modeKey, modeVal] of Object.entries(data.modes)) {
      const modeNum = Number(modeKey);
      const uzMap = new Map();

      // まずすべての節点を uz = 0.0 で初期化
      for (const nodeId of nodes.keys()) {
        uzMap.set(nodeId, 0.0);
      }

      // JSON に記載された値で上書き
      if (modeVal && typeof modeVal === 'object') {
        for (const [nodeKey, uzVal] of Object.entries(modeVal)) {
          const nodeId = Number(nodeKey);
          const uz = Number(uzVal);
          uzMap.set(nodeId, uz);
        }
      }

      modes.set(modeNum, uzMap);
    }
  }

  return { meta, nodes, nodeIdCounts, lines, freqHz, modes };
}

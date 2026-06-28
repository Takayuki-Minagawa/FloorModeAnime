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
 * YAML のスカラー値をこのアプリで扱う型へ変換する。
 * 対象は解析モデル YAML で使われる単純な subset（数値/真偽/null/文字列）。
 * @param {string} raw
 * @returns {string|number|boolean|null}
 */
function parseYamlScalar(raw) {
  const value = raw.trim();
  if (value === '') return '';
  if ((value.startsWith("'") && value.endsWith("'"))
    || (value.startsWith('"') && value.endsWith('"'))) {
    return value.slice(1, -1);
  }
  if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true';
  if (/^(null|~)$/i.test(value)) return null;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    return Number(value);
  }
  return value;
}

/**
 * 行頭スペース数を返す。
 * @param {string} line
 * @returns {number}
 */
function countIndent(line) {
  return line.length - line.trimStart().length;
}

/**
 * `key: value` を 1 回だけ分割する。
 * @param {string} text
 * @returns {[string,string]|null}
 */
function splitYamlKeyValue(text) {
  const idx = text.indexOf(':');
  if (idx < 0) return null;
  return [text.slice(0, idx).trim(), text.slice(idx + 1).trim()];
}

/**
 * 指定セクション直下にある `- key: value` 形式のオブジェクト配列を読む。
 * 解析モデルの nodes/elements だけに必要な軽量パーサ。
 * @param {Array<string>} lines
 * @param {RegExp} sectionPattern
 * @param {number} sectionIndent
 * @returns {Array<object>}
 */
function parseYamlObjectList(lines, sectionPattern, sectionIndent = 2) {
  const start = lines.findIndex((line) => sectionPattern.test(line));
  if (start < 0) return [];

  const items = [];
  let current = null;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = countIndent(line);
    if (indent <= sectionIndent && !trimmed.startsWith('- ')) break;

    if (indent === sectionIndent && trimmed.startsWith('- ')) {
      current = {};
      items.push(current);
      const rest = trimmed.slice(2).trim();
      const pair = splitYamlKeyValue(rest);
      if (pair) {
        current[toCamelCase(pair[0])] = parseYamlScalar(pair[1]);
      }
      continue;
    }

    if (!current || indent !== sectionIndent + 2) continue;
    const pair = splitYamlKeyValue(trimmed);
    if (!pair || pair[1] === '') continue;
    current[toCamelCase(pair[0])] = parseYamlScalar(pair[1]);
  }

  return items;
}

/**
 * 指定キー直下の `- value` 形式リストを読む。
 * @param {Array<string>} lines
 * @param {RegExp} keyPattern
 * @returns {Array<*>}
 */
function parseYamlScalarListAfter(lines, keyPattern) {
  const start = lines.findIndex((line) => keyPattern.test(line));
  if (start < 0) return [];

  const keyIndent = countIndent(lines[start]);
  const values = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const indent = countIndent(line);
    if (indent < keyIndent || (indent === keyIndent && !trimmed.startsWith('- '))) break;
    if (indent === keyIndent && trimmed.startsWith('- ')) {
      values.push(parseYamlScalar(trimmed.slice(2)));
    }
  }
  return values;
}

/**
 * 解析モデル YAML（生成済み calc YAML）のうち、表示とモード復元に必要な
 * nodes / elements / ndf / dof_order / units を抽出する。
 * @param {string} yamlText
 * @returns {object}
 */
function parseAnalysisModelYaml(yamlText) {
  const lines = yamlText.replace(/\r\n?/g, '\n').split('\n');
  const readScalar = (pattern) => {
    const line = lines.find((l) => pattern.test(l));
    if (!line) return undefined;
    const pair = splitYamlKeyValue(line.trim());
    return pair ? parseYamlScalar(pair[1]) : undefined;
  };

  const dofOrder = parseYamlScalarListAfter(lines, /^ {4}dof_order:\s*$/);

  return {
    schemaVersion: readScalar(/^schema_version:\s*/),
    units: {
      length: readScalar(/^ {2}length:\s*/),
    },
    model: {
      name: readScalar(/^ {2}name:\s*/),
      ndm: readScalar(/^ {2}ndm:\s*/),
      ndf: readScalar(/^ {2}ndf:\s*/),
      nodes: parseYamlObjectList(lines, /^ {2}nodes:\s*$/),
      elements: parseYamlObjectList(lines, /^ {2}elements:\s*$/),
      traceability: {
        dofOrder: dofOrder.length > 0 ? dofOrder : undefined,
      },
    },
  };
}

/**
 * 解析モデルテキストを JSON/YAML のどちらかとして読む。
 * @param {string} text
 * @returns {object}
 */
function parseAnalysisModelText(text) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return convertKeysToCamelCase(JSON.parse(text));
  }
  return parseAnalysisModelYaml(text);
}

/**
 * 解析結果 JSON を読む。
 * @param {string} text
 * @returns {object}
 */
function parseAnalysisResultText(text) {
  return convertKeysToCamelCase(JSON.parse(text));
}

/**
 * 解析モデルらしい構造かを判定する。
 * @param {object} value
 * @returns {boolean}
 */
function isAnalysisModelLike(value) {
  const model = value?.model ?? value;
  return Array.isArray(model?.nodes)
    && model.nodes.some((node) => node && (node.tag !== undefined || node.id !== undefined));
}

/**
 * 解析結果らしい構造かを判定する。
 * @param {object} value
 * @returns {boolean}
 */
function isAnalysisResultLike(value) {
  const result = value?.result ?? value;
  return Array.isArray(result?.modeShapesFull) || Array.isArray(result?.modeShapesReduced);
}

/**
 * 結合 JSON から解析モデル/結果の組を取り出す。
 * @param {object} data
 * @returns {{model:object,result:object}|null}
 */
function extractAnalysisPair(data) {
  const candidates = [
    [data.analysisModel, data.analysisResult],
    [data.calc, data.result],
    [data.model, data.result],
  ];

  for (const [model, result] of candidates) {
    if (isAnalysisModelLike(model) && isAnalysisResultLike(result)) {
      return { model, result };
    }
  }
  return null;
}

/**
 * 解析モデルの節点値から節点 ID を得る。
 * @param {object} node
 * @returns {number}
 */
function nodeIdOf(node) {
  return Number(node.id ?? node.tag ?? node.nodeTag);
}

/**
 * 解析モデルの node_i / node_j を既存 line 形式へ変換する。
 * @param {object} element
 * @param {number} fallbackId
 * @returns {{id:number,nodeI:number,nodeJ:number}|null}
 */
function lineFromElement(element, fallbackId) {
  const nodeI = Number(element.nodeI ?? element.iNode ?? element.nodeTagI);
  const nodeJ = Number(element.nodeJ ?? element.jNode ?? element.nodeTagJ);
  if (!Number.isFinite(nodeI) || !Number.isFinite(nodeJ)) return null;
  const id = Number(element.id ?? element.tag ?? fallbackId);
  return { id, nodeI, nodeJ };
}

/**
 * 解析結果の full mode matrix から値を読む関数を作る。
 * 対応形:
 *   1) rows = nodeCount * ndf, columns = modes
 *   2) rows = modes, columns = nodeCount * ndf
 * @param {Array<Array<number>>} matrix
 * @param {number} dofRowCount
 * @param {number} modeCount
 * @param {number} ndf
 * @returns {(nodeIndex:number,dofIndex:number,modeIndex:number)=>number}
 */
function createFullModeReader(matrix, dofRowCount, modeCount, ndf) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('E_MODE_SHAPE_FULL_MISSING: result.mode_shapes_full is missing');
  }

  const rowMajorDof = matrix.length === dofRowCount
    && matrix.every((row) => Array.isArray(row) && row.length >= modeCount);
  if (rowMajorDof) {
    return (nodeIndex, dofIndex, modeIndex) => {
      const row = nodeIndex * ndf + dofIndex;
      return Number(matrix[row]?.[modeIndex] ?? 0);
    };
  }

  const rowMajorMode = matrix.length >= modeCount
    && matrix.slice(0, modeCount).every((row) => Array.isArray(row) && row.length >= dofRowCount);
  if (rowMajorMode) {
    return (nodeIndex, dofIndex, modeIndex) => {
      const col = nodeIndex * ndf + dofIndex;
      return Number(matrix[modeIndex]?.[col] ?? 0);
    };
  }

  throw new Error(
    `E_MODE_SHAPE_FULL_SIZE: mode_shapes_full size must be ${dofRowCount}x${modeCount} or ${modeCount}x${dofRowCount}`,
  );
}

/**
 * 解析モデル + 解析結果を既存の床モード標準形へ変換する。
 *
 * modesFull は 1節点6自由度（ux,uy,uz,rx,ry,rz）を保持し、
 * modes は表示用に uz だけへ縮約した Map。
 *
 * @param {object} analysisModel
 * @param {object} analysisResult
 * @returns {{
 *   meta: object,
 *   nodes: Map<number,{id:number,x:number,y:number,z:number}>,
 *   nodeIdCounts: Map<number,number>,
 *   lines: Array<{id:number,nodeI:number,nodeJ:number}>,
 *   freqHz: Map<number,number>,
 *   modes: Map<number,Map<number,number>>,
 *   modesFull: Map<number,Map<number,object>>,
 *   phase0: Map<number,number>
 * }}
 */
export function convertAnalysisPairToFloorData(analysisModel, analysisResult) {
  const modelRoot = convertKeysToCamelCase(analysisModel);
  const resultRoot = convertKeysToCamelCase(analysisResult);
  const model = modelRoot.model ?? modelRoot;
  const result = resultRoot.result ?? resultRoot;

  const parsedNdf = Number(model.ndf ?? 6);
  const ndf = Number.isFinite(parsedNdf) && parsedNdf > 0 ? parsedNdf : 6;
  const dofOrder = (model.traceability?.dofOrder ?? ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'])
    .map((dof) => String(dof));
  const uzIndex = dofOrder.findIndex((dof) => dof.toLowerCase() === 'uz');
  const verticalDofIndex = uzIndex >= 0 ? uzIndex : 2;

  const nodes = new Map();
  const nodeIdCounts = new Map();
  const orderedNodeIds = [];
  for (const n of model.nodes ?? []) {
    const id = nodeIdOf(n);
    const x = Number(n.x ?? 0);
    const y = Number(n.y ?? 0);
    const z = Number(n.z ?? 0);
    orderedNodeIds.push(id);
    nodeIdCounts.set(id, (nodeIdCounts.get(id) ?? 0) + 1);
    nodes.set(id, { id, x, y, z });
  }

  const lines = [];
  let fallbackLineId = 1;
  for (const element of model.elements ?? []) {
    const line = lineFromElement(element, fallbackLineId);
    fallbackLineId++;
    if (line) lines.push(line);
  }

  const frequencies = result.frequenciesHz ?? result.freqHz ?? [];
  const modeShapesFull = result.modeShapesFull;
  const matrixModeCount = Array.isArray(modeShapesFull?.[0]) ? modeShapesFull[0].length : 0;
  const freqCount = Array.isArray(frequencies) ? frequencies.length : Object.keys(frequencies ?? {}).length;
  const parsedModeCount = Number(resultRoot.numModes ?? result.numModes);
  const modeCount = Number.isInteger(parsedModeCount) && parsedModeCount > 0
    ? parsedModeCount
    : (freqCount > 0 ? freqCount : matrixModeCount);

  const freqHz = new Map();
  for (let i = 0; i < modeCount; i++) {
    const modeNum = i + 1;
    const freq = Array.isArray(frequencies) ? frequencies[i] : frequencies[String(modeNum)];
    freqHz.set(modeNum, Number(freq));
  }

  const readFullMode = createFullModeReader(modeShapesFull, orderedNodeIds.length * ndf, modeCount, ndf);
  const modes = new Map();
  const modesFull = new Map();

  for (let modeIndex = 0; modeIndex < modeCount; modeIndex++) {
    const modeNum = modeIndex + 1;
    const uzMap = new Map();
    const fullNodeMap = new Map();

    orderedNodeIds.forEach((nodeId, nodeIndex) => {
      const dofValues = {};
      for (let dofIndex = 0; dofIndex < ndf; dofIndex++) {
        const dof = dofOrder[dofIndex] ?? `dof${dofIndex + 1}`;
        dofValues[dof] = readFullMode(nodeIndex, dofIndex, modeIndex);
      }
      fullNodeMap.set(nodeId, dofValues);
      uzMap.set(nodeId, dofValues[dofOrder[verticalDofIndex] ?? 'uz'] ?? 0);
    });

    modes.set(modeNum, uzMap);
    modesFull.set(modeNum, fullNodeMap);
  }

  const meta = {
    title: model.name ?? modelRoot.name ?? 'analysis modal result',
    lengthUnit: modelRoot.units?.length ?? model.units?.length,
    modeUnit: 'full_6dof',
    sourceFormat: 'analysis_model_result',
    dofOrder,
    verticalDof: dofOrder[verticalDofIndex] ?? 'uz',
  };

  return { meta, nodes, nodeIdCounts, lines, freqHz, modes, modesFull, phase0: new Map() };
}

/**
 * 解析モデルテキスト + 解析結果 JSON テキストを床モード標準形へ変換する。
 * @param {string} modelText
 * @param {string} resultText
 * @returns {ReturnType<typeof convertAnalysisPairToFloorData>}
 */
export function parseAnalysisPair(modelText, resultText) {
  let model;
  let result;
  try {
    model = parseAnalysisModelText(modelText);
  } catch (e) {
    throw new Error(`E_MODEL_PARSE: ${e.message}`, { cause: e });
  }
  try {
    result = parseAnalysisResultText(resultText);
  } catch (e) {
    throw new Error(`E_RESULT_PARSE: ${e.message}`, { cause: e });
  }
  return convertAnalysisPairToFloorData(model, result);
}

/**
 * UI から渡される単一/複数ファイル入力を床モード標準形へ変換する。
 * @param {string|Array<{name:string,text:string}>} source
 * @returns {ReturnType<typeof parseFloorData>}
 */
export function parseFloorDataSource(source) {
  if (!Array.isArray(source)) {
    return parseFloorData(source);
  }

  if (source.length === 1) {
    return parseFloorData(source[0].text);
  }

  const modelFile = source.find((file) => /(_calc|model|\.ya?ml$)/i.test(file.name));
  const resultFile = source.find((file) => /(_result|result|modal).*\.json$/i.test(file.name));
  if (!modelFile || !resultFile) {
    throw new Error('E_FILE_PAIR: select both analysis model (*_calc.yaml) and result (*_result.json)');
  }

  return parseAnalysisPair(modelFile.text, resultFile.text);
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
 *   modes: Map<number,Map<number,number>>,
 *   phase0: Map<number,number>
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

  const analysisPair = extractAnalysisPair(data);
  if (analysisPair) {
    return convertAnalysisPairToFloorData(analysisPair.model, analysisPair.result);
  }

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

  // --- 8. phase0 → Map<modeNum, radians>（任意。未指定モードは 0 とみなす） ----
  //    CLAUDE.md の式 sin(2π f t + φ0) の φ0。後方互換のため省略可能。
  const phase0 = new Map();
  if (data.phase0 && typeof data.phase0 === 'object') {
    for (const [key, val] of Object.entries(data.phase0)) {
      phase0.set(Number(key), Number(val));
    }
  }

  return { meta, nodes, nodeIdCounts, lines, freqHz, modes, phase0 };
}

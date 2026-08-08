/**
 * parser.js -- JSON読込・型変換・既定値適用
 *
 * @module parser
 */

import {
  attachProjectManifest,
  normalizeProjectManifest,
  parseProjectManifest,
} from './manifest.js';
import { isResponseArchive, parseResponseArchive } from './response.js';
import { parse as parseYaml } from 'yaml';

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
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        toCamelCase(key),
        convertKeysToCamelCase(child),
      ]),
    );
  }
  return value;
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
  return convertKeysToCamelCase(parseYaml(text));
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
  const value = node?.id ?? node?.tag ?? node?.nodeTag;
  return typeof value === 'number' ? value : Number.NaN;
}

/**
 * 解析モデルの node_i / node_j を既存 line 形式へ変換する。
 * @param {object} element
 * @param {number} fallbackId
 * @returns {{id:number,nodeI:number,nodeJ:number}}
 */
function lineFromElement(element, fallbackId) {
  const nodeIRaw = element?.nodeI ?? element?.iNode ?? element?.nodeTagI;
  const nodeJRaw = element?.nodeJ ?? element?.jNode ?? element?.nodeTagJ;
  const idRaw = element?.id ?? element?.tag ?? element?.nodeTag ?? fallbackId;
  const nodeI = typeof nodeIRaw === 'number' ? nodeIRaw : Number.NaN;
  const nodeJ = typeof nodeJRaw === 'number' ? nodeJRaw : Number.NaN;
  const id = typeof idRaw === 'number' ? idRaw : Number.NaN;
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
    && matrix.every((row) => Array.isArray(row) && row.length === modeCount);
  if (rowMajorDof) {
    return (nodeIndex, dofIndex, modeIndex) => {
      const row = nodeIndex * ndf + dofIndex;
      return matrix[row]?.[modeIndex];
    };
  }

  const rowMajorMode = matrix.length === modeCount
    && matrix.every((row) => Array.isArray(row) && row.length === dofRowCount);
  if (rowMajorMode) {
    return (nodeIndex, dofIndex, modeIndex) => {
      const col = nodeIndex * ndf + dofIndex;
      return matrix[modeIndex]?.[col];
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
 * @param {{manifest?:object,files?:Array<{name:string,text:string}>}} [options]
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
export function convertAnalysisPairToFloorData(analysisModel, analysisResult, options = {}) {
  const modelRoot = convertKeysToCamelCase(analysisModel);
  const resultRoot = convertKeysToCamelCase(analysisResult);
  const model = modelRoot.model ?? modelRoot;
  const result = resultRoot.result ?? resultRoot;

  const parsedNdf = Number(model.ndf ?? 6);
  const ndf = Number.isFinite(parsedNdf) && parsedNdf > 0 ? parsedNdf : 6;
  const rawDofOrder = model.traceability?.dofOrder;
  const declaredDofOrder = Array.isArray(rawDofOrder) ? rawDofOrder : null;
  const dofOrder = (declaredDofOrder ?? ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'])
    .map((dof) => String(dof));
  const uzIndex = dofOrder.findIndex((dof) => dof.toLowerCase() === 'uz');
  const verticalDofIndex = uzIndex >= 0 ? uzIndex : 2;

  const nodes = new Map();
  const nodeIdCounts = new Map();
  const orderedNodeIds = [];
  for (const n of model.nodes ?? []) {
    const id = nodeIdOf(n);
    const x = typeof n?.x === 'number' ? n.x : Number.NaN;
    const y = typeof n?.y === 'number' ? n.y : Number.NaN;
    const z = typeof n?.z === 'number' ? n.z : Number.NaN;
    orderedNodeIds.push(id);
    nodeIdCounts.set(id, (nodeIdCounts.get(id) ?? 0) + 1);
    nodes.set(id, { id, x, y, z });
  }

  const lines = [];
  let fallbackLineId = 1;
  for (const element of model.elements ?? []) {
    const line = lineFromElement(element, options.manifest ? undefined : fallbackLineId);
    fallbackLineId++;
    if (line) lines.push(line);
  }

  const frequencies = result.frequenciesHz ?? result.freqHz ?? [];
  const modeShapesFull = result.modeShapesFull;
  const matrixModeCount = Array.isArray(modeShapesFull?.[0]) ? modeShapesFull[0].length : 0;
  const freqCount = Array.isArray(frequencies) ? frequencies.length : Object.keys(frequencies ?? {}).length;
  const rawModeCount = resultRoot.numModes ?? result.numModes;
  const parsedModeCount = Number(rawModeCount);
  const modeCount = Number.isInteger(parsedModeCount) && parsedModeCount > 0
    ? parsedModeCount
    : (freqCount > 0 ? freqCount : matrixModeCount);

  const freqHz = new Map();
  for (let i = 0; i < modeCount; i++) {
    const modeNum = i + 1;
    const freq = Array.isArray(frequencies) ? frequencies[i] : frequencies[String(modeNum)];
    freqHz.set(modeNum, typeof freq === 'number' ? freq : Number.NaN);
  }

  const dofRowCount = orderedNodeIds.length * ndf;
  let readFullMode;
  try {
    readFullMode = createFullModeReader(modeShapesFull, dofRowCount, modeCount, ndf);
  } catch (error) {
    // A manifest-backed load reports all contract violations together in the
    // UI. Invalid matrix shapes therefore produce NaN placeholders here and
    // are rejected by attachProjectManifest/validateFloorData below.
    if (!options.manifest) throw error;
    readFullMode = () => Number.NaN;
  }
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
      uzMap.set(nodeId, dofValues[dofOrder[verticalDofIndex] ?? 'uz']);
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

  const floorData = {
    dataKind: 'mode',
    meta,
    nodes,
    nodeIdCounts,
    lines,
    freqHz,
    modes,
    modesFull,
    phase0: new Map(),
  };

  if (options.manifest) {
    return attachProjectManifest(floorData, options.manifest, {
      files: options.files ?? [],
      modelInfo: {
        nodeOrder: orderedNodeIds,
        ndf,
        dofOrder,
        hasNdf: Number.isInteger(model.ndf) && model.ndf > 0,
        hasDofOrder: Array.isArray(rawDofOrder)
          && rawDofOrder.length > 0
          && rawDofOrder.every((dof) => typeof dof === 'string'),
        lengthUnit: modelRoot.units?.length ?? model.units?.length,
      },
      resultInfo: {
        declaredModeCount: rawModeCount,
        hasDeclaredModeCount: Number.isInteger(rawModeCount) && rawModeCount > 0,
        dofRowCount,
        hasFrequencies: Object.hasOwn(result, 'frequenciesHz') || Object.hasOwn(result, 'freqHz'),
        frequencies,
        hasFullModes: Object.hasOwn(result, 'modeShapesFull'),
        modeShapesFull,
      },
    });
  }

  return floorData;
}

/**
 * 解析モデルテキスト + 解析結果 JSON テキストを床モード標準形へ変換する。
 * @param {string} modelText
 * @param {string} resultText
 * @param {string|null} [manifestText]
 * @param {Array<{name:string,text:string}>} [files]
 * @returns {ReturnType<typeof convertAnalysisPairToFloorData>}
 */
export function parseAnalysisPair(modelText, resultText, manifestText = null, files = []) {
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
  const manifest = manifestText === null ? null : parseProjectManifest(manifestText);
  return convertAnalysisPairToFloorData(model, result, { manifest, files });
}

function isProjectManifestFile(file) {
  if (/manifest.*\.(json|ya?ml)$/i.test(file.name)) return true;
  if (!/\.json$/i.test(file.name)) return false;
  try {
    const value = JSON.parse(file.text);
    return value?.schema_version === 'floorvib-project/1'
      || value?.schemaVersion === 'floorvib-project/1';
  } catch {
    return false;
  }
}

const fileBasename = (path) => String(path ?? '').replaceAll('\\', '/').split('/').at(-1);

function selectManifestDataFiles(dataFiles, manifestText) {
  const contract = normalizeProjectManifest(parseProjectManifest(manifestText));
  const expectedModelName = fileBasename(contract.modelArtifact?.path);
  const expectedResultName = fileBasename(contract.resultArtifact?.path);
  if (!expectedModelName || !expectedResultName) {
    throw new Error(
      'E_MANIFEST_ARTIFACT_MISSING: manifest must identify both model and modal result files',
    );
  }

  const selectUnique = (name, role) => {
    const matches = dataFiles.filter((file) => file.name === name);
    if (matches.length === 0) {
      throw new Error(`E_MANIFEST_ARTIFACT_MISSING: ${role} file ${name} was not selected`);
    }
    if (matches.length > 1) {
      throw new Error(`E_FILE_AMBIGUOUS: ${role} file ${name} was selected more than once`);
    }
    return matches[0];
  };

  const modelFile = selectUnique(expectedModelName, 'analysis model');
  const resultFile = selectUnique(expectedResultName, 'modal result');
  if (modelFile === resultFile) {
    throw new Error('E_FILE_AMBIGUOUS: model and modal result must be separate files');
  }
  const extras = dataFiles.filter((file) => file !== modelFile && file !== resultFile);
  if (extras.length > 0) {
    throw new Error(
      `E_FILE_AMBIGUOUS: manifest input contains unreferenced file(s): ${extras.map((file) => file.name).join(', ')}`,
    );
  }
  return { modelFile, resultFile };
}

function selectLegacyAnalysisFiles(dataFiles) {
  const resultFiles = dataFiles.filter((file) => /(_result|result|modal).*\.json$/i.test(file.name));
  const yamlModelFiles = dataFiles.filter((file) => /\.ya?ml$/i.test(file.name));
  const jsonModelFiles = dataFiles.filter((file) => !resultFiles.includes(file)
    && /(_calc|model).*\.json$/i.test(file.name));
  const modelFiles = yamlModelFiles.length > 0 ? yamlModelFiles : jsonModelFiles;

  if (resultFiles.length > 1 || modelFiles.length > 1) {
    throw new Error('E_FILE_AMBIGUOUS: select exactly one analysis model and one modal result');
  }
  const modelFile = modelFiles[0];
  const resultFile = resultFiles[0];
  if (!modelFile || !resultFile) {
    throw new Error('E_FILE_PAIR: select both analysis model (*_calc.yaml) and result (*_result.json)');
  }
  const extras = dataFiles.filter((file) => file !== modelFile && file !== resultFile);
  if (extras.length > 0) {
    throw new Error(
      `E_FILE_AMBIGUOUS: input contains unrecognized or extra file(s): ${extras.map((file) => file.name).join(', ')}`,
    );
  }
  return { modelFile, resultFile };
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

  const manifestFiles = source.filter(isProjectManifestFile);
  if (manifestFiles.length > 1) {
    throw new Error('E_FILE_AMBIGUOUS: select at most one project manifest');
  }
  const manifestFile = manifestFiles[0];
  const dataFiles = source.filter((file) => file !== manifestFile);
  const responseFiles = dataFiles.filter((file) => {
    if (!/\.json$/i.test(file.name)) return false;
    try {
      return isResponseArchive(JSON.parse(file.text));
    } catch {
      return false;
    }
  });
  if (responseFiles.length > 0) {
    throw new Error(
      'E_FILE_MIXED: a response archive must be selected alone; do not mix response and modal project files or select multiple response archives',
    );
  }

  const { modelFile, resultFile } = manifestFile
    ? selectManifestDataFiles(dataFiles, manifestFile.text)
    : selectLegacyAnalysisFiles(dataFiles);

  return parseAnalysisPair(
    modelFile.text,
    resultFile.text,
    manifestFile?.text ?? null,
    [modelFile, resultFile],
  );
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

  if (isResponseArchive(raw)) return parseResponseArchive(raw);

  // --- 2. キー名を camelCase に変換 -----------------------------------------
  const data = convertKeysToCamelCase(raw);

  const analysisPair = extractAnalysisPair(data);
  if (analysisPair) {
    return convertAnalysisPairToFloorData(analysisPair.model, analysisPair.result, {
      manifest: data.projectManifest ?? data.manifest,
    });
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

  return {
    dataKind: 'mode',
    meta,
    nodes,
    nodeIdCounts,
    lines,
    freqHz,
    modes,
    phase0,
  };
}

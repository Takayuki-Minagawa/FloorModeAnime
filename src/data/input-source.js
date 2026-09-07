import { normalizeProjectManifest, parseProjectManifest } from '../manifest.js';
import { isResponseArchive, parseResponseArchive } from '../response.js';
import { camelize as convertKeysToCamelCase } from './keys.js';
import { extractAnalysisPair, convertAnalysisPairToFloorData, parseAnalysisPair } from './analysis-pair.js';
import { parseLegacyData } from './legacy.js';

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
  const version = raw?.schema_version ?? raw?.schemaVersion;
  if (typeof version === 'string' && version.startsWith('floor-response-archive/')) {
    throw new Error('E_RESPONSE_SCHEMA: unsupported response archive schema version');
  }

  // --- 2. キー名を camelCase に変換 -----------------------------------------
  const data = convertKeysToCamelCase(raw);

  const analysisPair = extractAnalysisPair(data);
  if (analysisPair) {
    return convertAnalysisPairToFloorData(analysisPair.model, analysisPair.result, {
      manifest: data.projectManifest ?? data.manifest,
    });
  }

  return parseLegacyData(data);
}

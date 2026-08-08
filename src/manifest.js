/**
 * floorvib-project/1 viewer-side contract handling.
 *
 * The manifest is optional for legacy inputs.  Once supplied, ambiguity is a
 * fatal error: units, axes, node/DOF order and normalization must be explicit.
 */

import { canonicalJson, nodeOrderHash, textFileHash } from './integrity.js';
import { parse as parseYaml } from 'yaml';

export const PROJECT_SCHEMA_VERSION = 'floorvib-project/1';
export const CANONICAL_DOF_ORDER = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];

const CANONICAL_UNITS = {
  length: 'm',
  force: 'N',
  mass: 'kg',
  time: 's',
};

const SOURCE_UNIT_COHERENCE = {
  mm: { area: 'mm^2', secondMoment: 'mm^4' },
  m: { area: 'm^2', secondMoment: 'm^4' },
};

const NORMALIZATION_TYPES = new Set([
  'mass-normalized',
  'unit-modal-mass',
  'max-abs-component',
  'solver-eigenvector',
]);

const toCamelCase = (key) => key.replace(/[_-]([a-z0-9])/gi, (_, ch) => ch.toUpperCase());

function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [toCamelCase(key), camelize(child)]),
    );
  }
  return value;
}

const basename = (path) => String(path ?? '').replaceAll('\\', '/').split('/').at(-1);

function sameArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function addIssue(list, code, message) {
  list.push({ code, message });
}

function normalizeNormalization(value) {
  if (typeof value === 'string') {
    return {
      type: value.trim().toLowerCase().replaceAll('_', '-'),
      reference: '',
    };
  }
  if (!value || typeof value !== 'object') return null;
  return {
    ...value,
    type: String(value.type ?? '').trim().toLowerCase().replaceAll('_', '-'),
    reference: String(value.reference ?? '').trim(),
  };
}

function chooseConsistentAlias(conflicts, field, candidates, normalize = (value) => value) {
  const specified = candidates.filter((candidate) => candidate.value !== undefined);
  if (specified.length === 0) return undefined;
  const baseline = canonicalJson(normalize(specified[0].value));
  const mismatch = specified.find((candidate) =>
    canonicalJson(normalize(candidate.value)) !== baseline);
  if (mismatch) {
    conflicts.push({
      code: 'E_MANIFEST_ALIAS_CONFLICT',
      message: `${field} is declared inconsistently by ${specified.map((item) => item.label).join(', ')}`,
    });
  }
  return specified.find((candidate) => candidate.value !== null)?.value ?? specified[0].value;
}

function artifactIdentity(record) {
  if (record === null || record === undefined) return record;
  return {
    path: record.path ?? record.file,
    sha256: record.sha256,
    size: record.size,
  };
}

/** Parse a JSON or YAML project manifest. */
export function parseProjectManifest(text) {
  let raw;
  try {
    raw = text.trimStart().startsWith('{') ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    throw new Error(`E_MANIFEST_PARSE: invalid JSON/YAML manifest: ${error.message}`, { cause: error });
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('E_MANIFEST_PARSE: manifest root must be an object');
  }
  return raw;
}

/**
 * Normalize both the design-note nesting and the current upstream manifest
 * layout into the viewer's read-only contract view.
 */
export function normalizeProjectManifest(rawManifest) {
  const manifest = camelize(rawManifest);
  const aliasErrors = [];
  const model = manifest.model ?? {};
  const dimensions = manifest.dimensions ?? {};
  const modal = chooseConsistentAlias(aliasErrors, 'modal result', [
    { label: 'modal_result', value: manifest.modalResult },
    { label: 'modal_archive_input', value: manifest.modalArchiveInput },
  ]) ?? {};
  const coordinates = chooseConsistentAlias(aliasErrors, 'coordinates', [
    { label: 'coordinates', value: manifest.coordinates },
    { label: 'axes', value: manifest.axes },
  ]) ?? {};
  const nodeOrder = chooseConsistentAlias(aliasErrors, 'node order', [
    { label: 'model.node_order', value: model.nodeOrder },
    { label: 'node_order', value: manifest.nodeOrder },
    { label: 'model.node_ids', value: model.nodeIds },
  ]);
  const nodeOrderHashValue = chooseConsistentAlias(aliasErrors, 'node order hash', [
    { label: 'model.node_order_hash', value: model.nodeOrderHash },
    { label: 'node_order_hash', value: manifest.nodeOrderHash },
  ]);
  const dofOrder = chooseConsistentAlias(aliasErrors, 'DOF order', [
    { label: 'model.dof_order', value: model.dofOrder },
    { label: 'modal_result.dof_order', value: modal.dofOrder },
    { label: 'dof_order', value: manifest.dofOrder },
  ]);
  const ndf = chooseConsistentAlias(aliasErrors, 'ndf', [
    { label: 'model.ndf', value: model.ndf },
    { label: 'dimensions.ndf', value: dimensions.ndf },
  ]);
  const rawNormalization = chooseConsistentAlias(
    aliasErrors,
    'normalization',
    [
      { label: 'modal_result.normalization', value: modal.normalization },
      { label: 'normalization', value: manifest.normalization },
    ],
    normalizeNormalization,
  );
  const normalization = normalizeNormalization(rawNormalization);
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];

  const modelArtifactRecords = artifacts.filter((record) =>
    /model|bundle|calc/i.test(String(record?.role ?? '')));
  const resultArtifactRecords = artifacts.filter((record) =>
    /modal|solver.*result|result/i.test(String(record?.role ?? '')));
  if (modelArtifactRecords.length > 1) {
    aliasErrors.push({
      code: 'E_MANIFEST_ALIAS_CONFLICT',
      message: 'analysis model artifact is declared more than once in artifacts',
    });
  }
  if (resultArtifactRecords.length > 1) {
    aliasErrors.push({
      code: 'E_MANIFEST_ALIAS_CONFLICT',
      message: 'modal result artifact is declared more than once in artifacts',
    });
  }
  const nestedModelArtifact = ['file', 'sha256', 'size'].some((key) => Object.hasOwn(model, key))
    ? { path: model.file, sha256: model.sha256, size: model.size }
    : undefined;
  const nestedResultArtifact = ['file', 'sha256', 'size'].some((key) => Object.hasOwn(modal, key))
    ? { path: modal.file, sha256: modal.sha256, size: modal.size }
    : undefined;
  const modelArtifact = chooseConsistentAlias(
    aliasErrors,
    'analysis model artifact',
    [
      { label: 'model file/hash', value: nestedModelArtifact },
      { label: 'artifacts[analysis_model]', value: modelArtifactRecords[0] },
    ],
    artifactIdentity,
  ) ?? null;
  const resultArtifact = chooseConsistentAlias(
    aliasErrors,
    'modal result artifact',
    [
      { label: 'modal_result file/hash', value: nestedResultArtifact },
      { label: 'artifacts[modal_results]', value: resultArtifactRecords[0] },
    ],
    artifactIdentity,
  ) ?? null;
  const projectId = chooseConsistentAlias(aliasErrors, 'project identifier', [
    { label: 'project_id', value: manifest.projectId },
    { label: 'case_id', value: manifest.caseId },
  ]);
  const provenance = chooseConsistentAlias(aliasErrors, 'provenance', [
    { label: 'provenance', value: manifest.provenance },
    { label: 'generator', value: manifest.generator },
  ]);

  return {
    raw: manifest,
    aliasErrors,
    schemaVersion: manifest.schemaVersion,
    projectId,
    units: manifest.units,
    coordinates,
    nodeOrder,
    nodeOrderHash: nodeOrderHashValue,
    ndf,
    dofOrder,
    normalization,
    dimensions,
    model,
    modal,
    modelArtifact,
    resultArtifact,
    provenance,
    conversion: manifest.conversion,
  };
}

function coordinateSummary(nodes) {
  const values = [...nodes.values()];
  const axes = ['x', 'y', 'z'];
  const result = {};
  for (const axis of axes) {
    const axisValues = values.map((node) => node[axis]);
    result[axis] = {
      min: Math.min(...axisValues),
      max: Math.max(...axisValues),
    };
  }
  result.span = Math.max(
    result.x.max - result.x.min,
    result.y.max - result.y.min,
  );
  return result;
}

function validateUnits(contract, modelInfo, errors) {
  const canonical = contract.units?.canonical;
  const source = contract.units?.source;
  if (!canonical || typeof canonical !== 'object') {
    addIssue(errors, 'E_MANIFEST_UNITS_MISSING', 'units.canonical is required');
  } else {
    for (const [quantity, expected] of Object.entries(CANONICAL_UNITS)) {
      if (canonical[quantity] !== expected) {
        addIssue(
          errors,
          'E_MANIFEST_UNITS_MIXED',
          `units.canonical.${quantity} must be ${expected}, got ${canonical[quantity]}`,
        );
      }
    }
  }

  if (!source || typeof source !== 'object') {
    addIssue(errors, 'E_MANIFEST_UNITS_MISSING', 'units.source is required');
    return null;
  }
  for (const quantity of ['length', 'force', 'time']) {
    if (typeof source[quantity] !== 'string' || source[quantity].length === 0) {
      addIssue(errors, 'E_MANIFEST_UNITS_MISSING', `units.source.${quantity} is required`);
    }
  }
  if (!['m', 'mm'].includes(source.length)) {
    addIssue(
      errors,
      'E_MANIFEST_UNIT_UNSUPPORTED',
      `units.source.length=${source.length} is unsupported; use m or mm`,
    );
  }
  if (source.force !== 'N' || source.time !== 's') {
    addIssue(
      errors,
      'E_MANIFEST_UNITS_MIXED',
      `source units must use force=N and time=s, got force=${source.force}, time=${source.time}`,
    );
  }
  const coherent = SOURCE_UNIT_COHERENCE[source.length] ?? {};
  for (const [quantity, expected] of Object.entries(coherent)) {
    if (source[quantity] !== undefined && source[quantity] !== expected) {
      addIssue(
        errors,
        'E_MANIFEST_UNITS_MIXED',
        `units.source mixes length=${source.length} with ${quantity}=${source[quantity]}`,
      );
    }
  }
  if (!modelInfo.lengthUnit) {
    addIssue(errors, 'E_MODEL_UNIT_MISSING', 'analysis model units.length is required with a manifest');
  } else if (modelInfo.lengthUnit !== source.length) {
    addIssue(
      errors,
      'E_MODEL_UNIT_MISMATCH',
      `model length unit ${modelInfo.lengthUnit} does not match manifest source unit ${source.length}`,
    );
  }
  return source.length;
}

function validateOrdering(contract, modelInfo, errors) {
  const { nodeOrder, dofOrder, ndf } = contract;
  if (!modelInfo.hasNdf) {
    addIssue(errors, 'E_MODEL_NDF_MISSING', 'analysis model must explicitly declare a positive integer ndf');
  }
  if (!modelInfo.hasDofOrder) {
    addIssue(errors, 'E_MODEL_DOF_ORDER_MISSING', 'analysis model must explicitly declare dof_order');
  }
  if (!Array.isArray(nodeOrder) || nodeOrder.length === 0) {
    addIssue(errors, 'E_MANIFEST_NODE_ORDER', 'node_order must be a non-empty array');
  } else {
    if (new Set(nodeOrder).size !== nodeOrder.length) {
      addIssue(errors, 'E_MANIFEST_NODE_ORDER', 'node_order contains duplicate IDs');
    }
    if (!sameArray(nodeOrder, modelInfo.nodeOrder)) {
      addIssue(
        errors,
        'E_MANIFEST_NODE_ORDER',
        'manifest node_order must exactly match the analysis model node order',
      );
    }
  }

  if (!Number.isInteger(ndf) || ndf <= 0 || ndf > CANONICAL_DOF_ORDER.length) {
    addIssue(errors, 'E_MANIFEST_NDF', `ndf=${ndf} must be an integer from 1 to 6`);
  } else if (ndf !== modelInfo.ndf) {
    addIssue(errors, 'E_MANIFEST_NDF', `manifest ndf=${ndf} does not match model ndf=${modelInfo.ndf}`);
  }

  if (!Array.isArray(dofOrder) || dofOrder.length !== ndf) {
    addIssue(errors, 'E_MANIFEST_DOF_ORDER', 'dof_order length must equal ndf');
  } else {
    if (new Set(dofOrder).size !== dofOrder.length) {
      addIssue(errors, 'E_MANIFEST_DOF_ORDER', 'dof_order contains duplicate DOFs');
    }
    if (!sameArray(dofOrder, CANONICAL_DOF_ORDER.slice(0, ndf))) {
      addIssue(errors, 'E_MANIFEST_DOF_ORDER', 'dof_order must use ux,uy,uz,rx,ry,rz order');
    }
    if (!sameArray(dofOrder, modelInfo.dofOrder)) {
      addIssue(errors, 'E_MANIFEST_DOF_ORDER', 'manifest dof_order does not match model dof_order');
    }
  }

  if (Array.isArray(nodeOrder) && Array.isArray(dofOrder)) {
    const expected = nodeOrderHash(nodeOrder, dofOrder);
    if (contract.nodeOrderHash !== expected) {
      addIssue(
        errors,
        'E_MANIFEST_NODE_HASH',
        `node_order_hash mismatch: expected ${expected}, got ${contract.nodeOrderHash}`,
      );
    }
  }
}

function validateArtifacts(contract, files, errors) {
  const checks = [
    ['analysis model', contract.modelArtifact],
    ['modal result', contract.resultArtifact],
  ];
  for (const [label, record] of checks) {
    if (!record) {
      addIssue(errors, 'E_MANIFEST_ARTIFACT_MISSING', `${label} artifact metadata is required`);
      continue;
    }
    const expectedName = basename(record.path);
    const file = files.find((candidate) => candidate.name === expectedName);
    if (!file) {
      addIssue(
        errors,
        'E_MANIFEST_ARTIFACT_MISSING',
        `manifest artifact ${expectedName} was not supplied`,
      );
      continue;
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(record.sha256 ?? ''))) {
      addIssue(
        errors,
        'E_MANIFEST_ARTIFACT_HASH',
        `manifest artifact ${expectedName} has no valid sha256`,
      );
      continue;
    }
    const actualHash = textFileHash(file.text);
    if (actualHash !== record.sha256) {
      addIssue(
        errors,
        'E_MANIFEST_ARTIFACT_HASH',
        `${expectedName} hash mismatch: expected ${record.sha256}, got ${actualHash}`,
      );
    }
    if (record.size !== undefined) {
      const actualSize = new TextEncoder().encode(file.text).length;
      if (record.size !== actualSize) {
        addIssue(
          errors,
          'E_MANIFEST_ARTIFACT_SIZE',
          `${expectedName} size mismatch: expected ${record.size}, got ${actualSize}`,
        );
      }
    }
  }
}

function validateResultDimensions(resultInfo, errors) {
  const {
    declaredModeCount,
    hasDeclaredModeCount,
    dofRowCount,
    frequencies,
    modeShapesFull,
  } = resultInfo;

  if (!hasDeclaredModeCount) {
    addIssue(errors, 'E_RESULT_MODE_COUNT', 'num_modes must be a positive integer');
    return;
  }

  if (Array.isArray(frequencies) && frequencies.length !== declaredModeCount) {
    addIssue(
      errors,
      'E_RESULT_MODE_COUNT',
      `num_modes=${declaredModeCount} must equal frequencies_hz length=${frequencies.length}`,
    );
  }

  if (!Array.isArray(modeShapesFull) || modeShapesFull.length === 0) return;
  const dofMajor = modeShapesFull.length === dofRowCount
    && modeShapesFull.every((row) => Array.isArray(row) && row.length === declaredModeCount);
  const modeMajor = modeShapesFull.length === declaredModeCount
    && modeShapesFull.every((row) => Array.isArray(row) && row.length === dofRowCount);
  if (!dofMajor && !modeMajor) {
    const rowLengths = modeShapesFull.map((row) => Array.isArray(row) ? row.length : 'non-array');
    const uniqueLengths = [...new Set(rowLengths)];
    const columns = uniqueLengths.length === 1 ? uniqueLengths[0] : `ragged(${uniqueLengths.join(',')})`;
    addIssue(
      errors,
      'E_MODE_SHAPE_FULL_SIZE',
      `mode_shapes_full is ${modeShapesFull.length}x${columns}; expected exactly ${dofRowCount}x${declaredModeCount} or ${declaredModeCount}x${dofRowCount}`,
    );
  }
}

function applyLengthConversion(floorData, sourceLength, warnings) {
  const factor = sourceLength === 'mm' ? 1e-3 : 1;
  const before = coordinateSummary(floorData.nodes);
  if (factor !== 1) {
    floorData.nodes = new Map([...floorData.nodes].map(([id, node]) => [id, {
      ...node,
      x: node.x * factor,
      y: node.y * factor,
      z: node.z * factor,
    }]));
  }
  const after = coordinateSummary(floorData.nodes);
  const summary = {
    quantity: 'length',
    sourceUnit: sourceLength,
    canonicalUnit: 'm',
    factor,
    before,
    after,
  };
  if (factor !== 1) {
    addIssue(
      warnings,
      'W_UNIT_CONVERTED',
      `coordinates explicitly converted ${sourceLength}->m (x${factor}; floor span ${before.span} ${sourceLength} -> ${after.span} m; z ${before.z.min}..${before.z.max} ${sourceLength} -> ${after.z.min}..${after.z.max} m)`,
    );
  }
  floorData.meta = {
    ...floorData.meta,
    lengthUnit: 'm',
    sourceLengthUnit: sourceLength,
    unitConversion: summary,
  };
  return summary;
}

/**
 * Validate and attach a manifest, applying only an explicitly declared length
 * conversion.  Semantic issues are collected for validateFloorData so the UI
 * can show the complete error list and stop before rendering.
 */
export function attachProjectManifest(floorData, rawManifest, context = {}) {
  const contract = normalizeProjectManifest(rawManifest);
  const errors = [];
  const warnings = [];
  const modelInfo = context.modelInfo ?? {};
  const resultInfo = context.resultInfo ?? {};
  const files = context.files ?? [];

  for (const issue of contract.aliasErrors ?? []) {
    addIssue(errors, issue.code, issue.message);
  }

  if (contract.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    addIssue(
      errors,
      'E_MANIFEST_SCHEMA',
      `schema_version must be ${PROJECT_SCHEMA_VERSION}, got ${contract.schemaVersion}`,
    );
  }

  const sourceLength = validateUnits(contract, modelInfo, errors);

  const rightHanded = contract.coordinates?.rightHanded === true
    || contract.coordinates?.handedness === 'right';
  const verticalAxis = contract.coordinates?.verticalAxis
    ?? (String(contract.coordinates?.z ?? '').includes('up') ? 'z' : undefined);
  if (!rightHanded || verticalAxis !== 'z') {
    addIssue(
      errors,
      'E_MANIFEST_COORDINATES',
      'coordinates must declare a right-handed system with vertical_axis=z',
    );
  }

  validateOrdering(contract, modelInfo, errors);

  if (!contract.normalization
    || !NORMALIZATION_TYPES.has(contract.normalization.type)
    || !contract.normalization.reference) {
    addIssue(
      errors,
      'E_MANIFEST_NORMALIZATION',
      'normalization type/reference is missing or unknown',
    );
  }
  if (!contract.provenance || typeof contract.provenance !== 'object'
    || Array.isArray(contract.provenance)
    || Object.keys(contract.provenance).length === 0) {
    addIssue(errors, 'E_MANIFEST_PROVENANCE', 'provenance or generator metadata is required');
  }

  if (!resultInfo.hasFrequencies || !Array.isArray(resultInfo.frequencies)
    || resultInfo.frequencies.length === 0) {
    addIssue(errors, 'E_RESULT_FREQUENCIES_REQUIRED', 'frequencies_hz must be a non-empty array');
  }
  if (!resultInfo.hasFullModes || !Array.isArray(resultInfo.modeShapesFull)
    || resultInfo.modeShapesFull.length === 0) {
    addIssue(errors, 'E_MODE_SHAPE_FULL_MISSING', 'mode_shapes_full must be a non-empty array');
  }
  validateResultDimensions(resultInfo, errors);

  const expectedNodeCount = contract.dimensions?.nodeCount;
  const expectedElementCount = contract.dimensions?.elementCount;
  const expectedDofCount = contract.dimensions?.dofCount;
  for (const [field, value] of Object.entries({
    node_count: expectedNodeCount,
    element_count: expectedElementCount,
    ndf: contract.dimensions?.ndf,
    dof_count: expectedDofCount,
  })) {
    if (!Number.isInteger(value) || value <= 0) {
      addIssue(errors, 'E_MANIFEST_DIMENSION', `dimensions.${field} must be a positive integer`);
    }
  }
  if (expectedNodeCount !== undefined && expectedNodeCount !== floorData.nodes.size) {
    addIssue(errors, 'E_MANIFEST_DIMENSION', 'dimensions.node_count does not match parsed nodes');
  }
  if (expectedElementCount !== undefined && expectedElementCount !== floorData.lines.length) {
    addIssue(errors, 'E_MANIFEST_DIMENSION', 'dimensions.element_count does not match parsed lines');
  }
  if (expectedDofCount !== undefined && expectedDofCount !== floorData.nodes.size * contract.ndf) {
    addIssue(errors, 'E_MANIFEST_DIMENSION', 'dimensions.dof_count must equal node_count * ndf');
  }

  validateArtifacts(contract, files, errors);

  const conversionBlockingCodes = new Set([
    'E_MANIFEST_UNITS_MISSING',
    'E_MANIFEST_UNITS_MIXED',
    'E_MANIFEST_UNIT_UNSUPPORTED',
    'E_MODEL_UNIT_MISSING',
    'E_MODEL_UNIT_MISMATCH',
  ]);
  const canConvert = sourceLength
    && !errors.some((item) => conversionBlockingCodes.has(item.code));
  const conversion = canConvert
    ? applyLengthConversion(floorData, sourceLength, warnings)
    : null;

  floorData.meta = {
    ...floorData.meta,
    projectId: contract.projectId,
    modeNormalization: contract.normalization,
  };
  floorData.contract = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    manifest: contract,
    errors,
    warnings,
    conversion,
  };
  return floorData;
}

/**
 * floorvib-project/1 viewer-side contract handling.
 *
 * The manifest is optional for legacy inputs.  Once supplied, ambiguity is a
 * fatal error: units, axes, node/DOF order and normalization must be explicit.
 */

import { nodeOrderHash, textFileHash } from './integrity.js';
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
      reference: 'manifest declaration',
    };
  }
  if (!value || typeof value !== 'object') return null;
  return {
    ...value,
    type: String(value.type ?? '').trim().toLowerCase().replaceAll('_', '-'),
    reference: String(value.reference ?? '').trim(),
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
  const model = manifest.model ?? {};
  const dimensions = manifest.dimensions ?? {};
  const modal = manifest.modalResult ?? manifest.modalArchiveInput ?? {};
  const coordinates = manifest.coordinates ?? manifest.axes ?? {};
  const nodeOrder = manifest.nodeOrder ?? model.nodeOrder ?? model.nodeIds;
  const dofOrder = manifest.dofOrder ?? model.dofOrder ?? modal.dofOrder;
  const ndf = dimensions.ndf ?? model.ndf;
  const normalization = normalizeNormalization(manifest.normalization ?? modal.normalization);
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];

  const modelArtifact = artifacts.find((record) =>
    /model|bundle|calc/i.test(String(record?.role ?? '')))
    ?? (model.file ? { path: model.file, sha256: model.sha256, size: model.size } : null);
  const resultArtifact = artifacts.find((record) =>
    /modal|solver.*result|result/i.test(String(record?.role ?? '')))
    ?? (modal.file ? { path: modal.file, sha256: modal.sha256, size: modal.size } : null);

  return {
    raw: manifest,
    schemaVersion: manifest.schemaVersion,
    projectId: manifest.projectId ?? manifest.caseId,
    units: manifest.units,
    coordinates,
    nodeOrder,
    nodeOrderHash: manifest.nodeOrderHash ?? model.nodeOrderHash,
    ndf,
    dofOrder,
    normalization,
    dimensions,
    model,
    modal,
    modelArtifact,
    resultArtifact,
    provenance: manifest.provenance ?? manifest.generator,
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
  const checks = [contract.modelArtifact, contract.resultArtifact].filter(Boolean);
  for (const record of checks) {
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
  if (!contract.provenance || Object.keys(contract.provenance).length === 0) {
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

  const expectedNodeCount = contract.dimensions?.nodeCount;
  const expectedElementCount = contract.dimensions?.elementCount;
  const expectedDofCount = contract.dimensions?.dofCount;
  if (expectedNodeCount !== undefined && expectedNodeCount !== floorData.nodes.size) {
    addIssue(errors, 'E_MANIFEST_DIMENSION', 'dimensions.node_count does not match parsed nodes');
  }
  if (expectedElementCount !== undefined && expectedElementCount !== floorData.lines.length) {
    addIssue(errors, 'E_MANIFEST_DIMENSION', 'dimensions.element_count does not match parsed lines');
  }
  if (expectedDofCount !== undefined && expectedDofCount !== floorData.nodes.size * contract.ndf) {
    addIssue(errors, 'E_MANIFEST_DIMENSION', 'dimensions.dof_count must equal node_count * ndf');
  }

  if (files.length > 0) validateArtifacts(contract, files, errors);

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

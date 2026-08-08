/** Parser for the versioned physical-response viewer schema. */

export const RESPONSE_SCHEMA_VERSION = 'floor-response-archive/1';

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

export function isResponseArchive(value) {
  return value?.schema_version === RESPONSE_SCHEMA_VERSION
    || value?.schemaVersion === RESPONSE_SCHEMA_VERSION;
}

function deriveLines(faces) {
  const edges = new Map();
  for (const face of faces) {
    const ids = face.nodeIds;
    for (let index = 0; index < ids.length; index++) {
      const nodeI = ids[index];
      const nodeJ = ids[(index + 1) % ids.length];
      const key = nodeI < nodeJ ? `${nodeI}:${nodeJ}` : `${nodeJ}:${nodeI}`;
      if (!edges.has(key)) edges.set(key, { nodeI, nodeJ });
    }
  }
  return [...edges.values()].map((line, index) => ({ id: index + 1, ...line }));
}

/**
 * Convert a response archive object/string to the shared floor-data shape.
 * Semantic validation is deliberately deferred to validator.js so all issues
 * can be displayed together.
 */
export function parseResponseArchive(source) {
  let raw;
  if (typeof source === 'string') {
    try {
      raw = JSON.parse(source);
    } catch (error) {
      throw new Error(`E_RESPONSE_PARSE: ${error.message}`, { cause: error });
    }
  } else {
    raw = source;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('E_RESPONSE_PARSE: response archive root must be an object');
  }
  const data = camelize(raw);

  const nodes = new Map();
  const nodeIdCounts = new Map();
  for (const item of data.nodes ?? []) {
    const id = Number(item.id);
    nodeIdCounts.set(id, (nodeIdCounts.get(id) ?? 0) + 1);
    nodes.set(id, {
      id,
      x: Number(item.x),
      y: Number(item.y),
      z: Number(item.z),
    });
  }

  const faces = (data.faces ?? []).map((face, index) => ({
    id: Number(face.id ?? index + 1),
    nodeIds: (face.nodeIds ?? face.nodes ?? []).map(Number),
  }));
  const lines = Array.isArray(data.lines) && data.lines.length > 0
    ? data.lines.map((line) => ({
      id: Number(line.id),
      nodeI: Number(line.nodeI),
      nodeJ: Number(line.nodeJ),
    }))
    : deriveLines(faces);

  const nodeOrder = (data.nodeOrder ?? []).map(Number);
  const times = (data.timeS ?? []).map(Number);
  const values = (data.responseValues ?? []).map((frame) =>
    Array.isArray(frame) ? frame.map(Number) : frame);
  const normalization = typeof data.normalization === 'string'
    ? { type: data.normalization, reference: '' }
    : data.normalization;

  return {
    dataKind: 'response',
    meta: {
      title: data.caseId ?? data.meta?.title ?? 'physical response archive',
      lengthUnit: data.units?.length,
      sourceFormat: RESPONSE_SCHEMA_VERSION,
    },
    nodes,
    nodeIdCounts,
    lines,
    faces,
    freqHz: new Map(),
    modes: new Map(),
    phase0: new Map(),
    response: {
      schemaVersion: data.schemaVersion,
      caseId: data.caseId,
      quantity: data.quantity,
      unit: data.units?.response ?? data.responseUnit,
      units: data.units,
      coordinates: data.coordinates,
      normalization: normalization?.type,
      normalizationReference: normalization?.reference,
      nodeOrder,
      times,
      values,
      provenance: data.provenance,
    },
  };
}

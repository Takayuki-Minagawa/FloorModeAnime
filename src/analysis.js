import { EPS } from './constants.js';
import { canonicalJson, textFileHash } from './integrity.js';

function requireResponse(data) {
  if (data?.dataKind !== 'response' || !data.response?.times?.length) {
    throw new Error('E_ANALYSIS_RESPONSE: a validated physical response archive is required');
  }
  return data.response;
}

/** Original archive samples, without interpolation or graph decimation. */
export function getNodeHistory(data, nodeId) {
  const response = requireResponse(data);
  const index = response.nodeOrder.indexOf(nodeId);
  if (index < 0) throw new Error(`E_ANALYSIS_NODE: node ${nodeId} is unavailable`);
  return response.times.map((time, frame) => ({ time, value: response.values[frame][index] }));
}

/** Ties use the earliest time, then the smallest numeric node ID. */
export function computeResponsePeaks(data) {
  const response = requireResponse(data);
  const nodes = response.nodeOrder.map((nodeId, column) => {
    const initial = response.values[0][column];
    const peak = { nodeId, min: initial, max: initial, maxAbs: Math.abs(initial),
      timeOfMin: response.times[0], timeOfMax: response.times[0],
      timeOfMaxAbs: response.times[0], valueAtMaxAbs: initial };
    response.times.forEach((time, frame) => {
      const value = response.values[frame][column];
      if (value < peak.min) { peak.min = value; peak.timeOfMin = time; }
      if (value > peak.max) { peak.max = value; peak.timeOfMax = time; }
      if (Math.abs(value) > peak.maxAbs) {
        peak.maxAbs = Math.abs(value);
        peak.timeOfMaxAbs = time;
        peak.valueAtMaxAbs = value;
      }
    });
    return peak;
  }).sort((a, b) => a.nodeId - b.nodeId);
  let winner = nodes[0];
  for (const peak of nodes) {
    if (peak.maxAbs > winner.maxAbs || (peak.maxAbs === winner.maxAbs
      && peak.timeOfMaxAbs < winner.timeOfMaxAbs)) winner = peak;
  }
  return { nodes, global: { nodeId: winner.nodeId, value: winner.valueAtMaxAbs,
    maxAbs: winner.maxAbs, time: winner.timeOfMaxAbs } };
}

function coordinateContract(data) {
  const coordinates = data.contract?.manifest?.coordinates ?? data.meta?.coordinates;
  return { verticalAxis: coordinates?.verticalAxis ?? 'z',
    handedness: coordinates?.handedness ?? (coordinates?.rightHanded === false ? 'left' : 'right'),
    verticalDof: data.meta?.verticalDof ?? 'uz' };
}

/** ID-matched, unweighted vertical-component MAC (zero vectors are undefined). */
export function compareModes(dataA, dataB) {
  if (dataA?.dataKind === 'response' || dataB?.dataKind === 'response') {
    throw new Error('E_COMPARE_KIND: modal inputs are required');
  }
  const unit = dataA.meta?.lengthUnit;
  if (!unit || unit !== dataB.meta?.lengthUnit) {
    throw new Error('E_COMPARE_UNITS: both cases must declare the same length unit');
  }
  if (canonicalJson(coordinateContract(dataA)) !== canonicalJson(coordinateContract(dataB))) {
    throw new Error('E_COMPARE_COORDINATES: coordinate systems or vertical components differ');
  }
  const nodeIds = [...dataA.nodes.keys()].sort((a, b) => a - b);
  if (nodeIds.length !== dataB.nodes.size || nodeIds.some((id) => !dataB.nodes.has(id))) {
    throw new Error('E_COMPARE_NODES: node ID sets differ');
  }
  const extent = (data) => ['x', 'y', 'z'].map((axis) => {
    let min = Infinity, max = -Infinity;
    for (const node of data.nodes.values()) { min = Math.min(min, node[axis]); max = Math.max(max, node[axis]); }
    return max - min;
  });
  const tolerance = EPS * Math.max(1, ...extent(dataA), ...extent(dataB));
  for (const id of nodeIds) {
    if (['x', 'y', 'z'].some((axis) =>
      Math.abs(dataA.nodes.get(id)[axis] - dataB.nodes.get(id)[axis]) > tolerance)) {
      throw new Error(`E_COMPARE_COORDINATES: coordinates differ for node ${id}`);
    }
  }
  const rows = [];
  for (const [modeA, a] of dataA.modes) {
    for (const [modeB, b] of dataB.modes) {
      let maxA = 0, maxB = 0;
      for (const id of nodeIds) {
        maxA = Math.max(maxA, Math.abs(a.get(id) ?? 0));
        maxB = Math.max(maxB, Math.abs(b.get(id) ?? 0));
      }
      let aa = 0, bb = 0, ab = 0;
      if (maxA > 0 && maxB > 0) {
        for (const id of nodeIds) {
          const av = (a.get(id) ?? 0) / maxA, bv = (b.get(id) ?? 0) / maxB;
          aa += av * av; bb += bv * bv; ab += av * bv;
        }
      }
      const frequencyA = dataA.freqHz.get(modeA), frequencyB = dataB.freqHz.get(modeB);
      rows.push({ modeA, modeB, frequencyA, frequencyB,
        frequencyDifference: frequencyB - frequencyA,
        mac: aa > 0 && bb > 0 ? Math.min(1, Math.max(0, ab * ab / (aa * bb))) : null });
    }
  }
  return { rows, nodeIds, lengthUnit: unit, component: 'uz', weighting: 'none' };
}

/** Content identity for display settings. Map keys and numerical content are included. */
export function getDataIdentity(data) {
  const serialize = (value) => {
    if (value instanceof Map) return [...value.entries()]
      .sort(([a], [b]) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)))
      .map(([key, child]) => [key, serialize(child)]);
    if (Array.isArray(value)) return value.map(serialize);
    if (value !== null && typeof value === 'object') return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, serialize(child)]));
    return value;
  };
  return textFileHash(canonicalJson(serialize({ dataKind: data.dataKind, meta: data.meta,
    nodes: data.nodes, lines: data.lines, faces: data.faces, freqHz: data.freqHz,
    modes: data.modes, modesFull: data.modesFull, phase0: data.phase0, response: data.response })));
}

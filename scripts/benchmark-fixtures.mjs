/** Deterministic synthetic inputs shared by CPU and browser benchmarks. */
export function makeSource(nodeCount, kind, sampleCount = 120) {
  const width = Math.ceil(Math.sqrt(nodeCount));
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: index + 1, x: index % width, y: Math.floor(index / width), z: 0,
  }));
  const lines = nodes.slice(1).map((node, index) => ({ id: index + 1, node_i: node.id - 1, node_j: node.id }));
  if (kind === 'mode') return JSON.stringify({
    meta: { title: `Synthetic ${nodeCount} nodes`, length_unit: 'm', mode_unit: 'normalized' },
    nodes, lines, freq_hz: { 1: 25, 2: 70 },
    modes: Object.fromEntries([1, 2].map(mode => [mode, Object.fromEntries(nodes.map(node => [node.id, Math.sin(node.id * mode * 0.01)]))])),
  });
  const faces = [];
  for (let index = 0; index + width + 1 < nodeCount; index++) {
    if (index % width < width - 1) faces.push({ id: faces.length + 1, node_ids: [index + 1, index + 2, index + width + 2, index + width + 1] });
  }
  return JSON.stringify({
    schema_version: 'floor-response-archive/1', case_id: `benchmark-${nodeCount}`,
    units: { length: 'm', time: 's', response: 'm/s^2' },
    coordinates: { vertical_axis: 'z', handedness: 'right' },
    quantity: 'vertical_acceleration', normalization: { type: 'physical', reference: 'Synthetic benchmark' },
    nodes, lines, faces, node_order: nodes.map(node => node.id),
    time_s: Array.from({ length: sampleCount }, (_, index) => index / 60),
    response_values: Array.from({ length: sampleCount }, (_, frame) => nodes.map(node => Math.sin(node.id * 0.01) * Math.sin(frame * 0.1))),
    provenance: { producer: 'FloorModeAnime benchmark', producer_schema: 'synthetic/1', evaluation_profile: 'none' },
  });
}

import { describe, expect, it } from 'vitest';
import { parseFloorDataSource } from '../src/parser.js';
import { validateFloorData } from '../src/validator.js';
import { nodeOrderHash, textFileHash } from '../src/integrity.js';
import { stringify as stringifyYaml } from 'yaml';

const DOFS = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];

const modelText = `schema_version: '1'
units:
  length: mm
model:
  name: manifest-test
  ndf: 6
  nodes:
  - tag: 1
    x: 0
    y: 0
    z: 2800
  - tag: 2
    x: 2000
    y: 0
    z: 2800
  elements:
  - tag: 1
    node_i: 1
    node_j: 2
  traceability:
    dof_order:
    - ux
    - uy
    - uz
    - rx
    - ry
    - rz
`;

const fullMode = Array.from({ length: 12 }, (_, row) => [row === 2 ? 1 : 0]);
const resultText = JSON.stringify({
  analysis_kind: 'modal',
  num_modes: 1,
  result: {
    frequencies_hz: [5.2],
    mode_shapes_full: fullMode,
  },
});

function manifest(overrides = {}) {
  const base = {
    schema_version: 'floorvib-project/1',
    project_id: 'manifest-test',
    status: 'generated',
    units: {
      canonical: { length: 'm', force: 'N', mass: 'kg', time: 's' },
      source: {
        length: 'mm', force: 'N', time: 's', area: 'mm^2', second_moment: 'mm^4',
      },
    },
    axes: { x: 'global-x', y: 'global-y', z: 'global-up', right_handed: true },
    normalization: { type: 'mass-normalized', reference: 'solver export' },
    dof_order: DOFS,
    node_order: [1, 2],
    node_order_hash: nodeOrderHash([1, 2], DOFS),
    dimensions: { node_count: 2, element_count: 1, ndf: 6, dof_count: 12 },
    model: { node_ids: [1, 2] },
    generator: { name: 'test', revision: 'fixture' },
    artifacts: [
      {
        role: 'analysis_model',
        path: 'case_calc.yaml',
        sha256: textFileHash(modelText),
        size: new TextEncoder().encode(modelText).length,
      },
      {
        role: 'modal_results',
        path: 'case_modal_result.json',
        sha256: textFileHash(resultText),
        size: new TextEncoder().encode(resultText).length,
      },
    ],
  };
  return { ...base, ...overrides };
}

function parseWithManifest(value = manifest(), model = modelText, result = resultText) {
  return parseFloorDataSource([
    { name: 'case_calc.yaml', text: model },
    { name: 'case_modal_result.json', text: result },
    { name: 'project_manifest.json', text: JSON.stringify(value) },
  ]);
}

const errorCodes = (data) => validateFloorData(data).errors.map((item) => item.code);

describe('floorvib-project/1 manifest gate', () => {
  it('accepts a coherent manifest and explicitly converts mm coordinates to m', () => {
    const data = parseWithManifest();
    const { errors, warnings } = validateFloorData(data);

    expect(errors).toEqual([]);
    expect(data.nodes.get(2).x).toBe(2);
    expect(data.nodes.get(1).z).toBeCloseTo(2.8, 12);
    expect(data.meta.lengthUnit).toBe('m');
    expect(data.contract.conversion.factor).toBe(1e-3);
    expect(warnings.map((item) => item.code)).toContain('W_UNIT_CONVERTED');
    expect(warnings.find((item) => item.code === 'W_UNIT_CONVERTED').message)
      .toContain('2000 mm -> 2 m');
  });

  it('accepts an upstream-style YAML manifest file', () => {
    const data = parseFloorDataSource([
      { name: 'case_calc.yaml', text: modelText },
      { name: 'case_modal_result.json', text: resultText },
      { name: 'project_manifest.yaml', text: stringifyYaml(manifest()) },
    ]);
    expect(validateFloorData(data).errors).toEqual([]);
  });

  it('stops when node order is swapped even if the supplied hash is self-consistent', () => {
    const value = manifest({
      node_order: [2, 1],
      node_order_hash: nodeOrderHash([2, 1], DOFS),
    });
    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_NODE_ORDER');
  });

  it('stops on mixed source length/area units', () => {
    const value = manifest();
    value.units.source.area = 'm^2';
    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_UNITS_MIXED');
  });

  it('stops on a duplicate model node ID', () => {
    const duplicateModel = modelText.replace('  - tag: 2', '  - tag: 1');
    const value = manifest();
    value.artifacts[0].sha256 = textFileHash(duplicateModel);
    value.artifacts[0].size = new TextEncoder().encode(duplicateModel).length;
    expect(errorCodes(parseWithManifest(value, duplicateModel))).toContain('E_NODE_DUPLICATE');
  });

  it('stops when an artifact hash does not match the selected file', () => {
    const value = manifest();
    value.artifacts[1].sha256 = `sha256:${'0'.repeat(64)}`;
    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_ARTIFACT_HASH');
  });

  it('stops when normalization provenance is unknown', () => {
    const value = manifest({ normalization: { type: 'unknown', reference: '' } });
    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_NORMALIZATION');
  });

  it('stops when a full mode component is non-finite', () => {
    const invalidResult = JSON.stringify({
      analysis_kind: 'modal',
      num_modes: 1,
      result: {
        frequencies_hz: [5.2],
        mode_shapes_full: fullMode.map((row, index) => index === 4 ? ['NaN'] : row),
      },
    });
    const value = manifest();
    value.artifacts[1].sha256 = textFileHash(invalidResult);
    value.artifacts[1].size = new TextEncoder().encode(invalidResult).length;
    expect(errorCodes(parseWithManifest(value, modelText, invalidResult)))
      .toContain('E_MODE_SHAPE_NONFINITE');
  });
});

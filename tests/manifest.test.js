import { describe, expect, it } from 'vitest';
import { parseFloorData, parseFloorDataSource } from '../src/parser.js';
import { validateFloorData } from '../src/validator.js';
import { nodeOrderHash, textFileHash } from '../src/integrity.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

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

function errorCodesForResult(resultObject) {
  const invalidResult = JSON.stringify(resultObject);
  const value = manifest();
  value.artifacts[1].sha256 = textFileHash(invalidResult);
  value.artifacts[1].size = new TextEncoder().encode(invalidResult).length;
  return errorCodes(parseWithManifest(value, modelText, invalidResult));
}

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

  it('does not let an embedded manifest bypass artifact-file verification', () => {
    const embeddedPair = {
      analysis_model: parseYaml(modelText),
      analysis_result: JSON.parse(resultText),
    };
    const legacyData = parseFloorData(JSON.stringify(embeddedPair));
    expect(errorCodes(legacyData)).not.toContain('E_MANIFEST_ARTIFACT_MISSING');

    const gatedData = parseFloorData(JSON.stringify({
      ...embeddedPair,
      project_manifest: manifest(),
    }));
    expect(errorCodes(gatedData)).toContain('E_MANIFEST_ARTIFACT_MISSING');
  });

  it('requires both model and result artifact metadata', () => {
    expect(() => parseWithManifest(manifest({ artifacts: [] })))
      .toThrow(/E_MANIFEST_ARTIFACT_MISSING/);
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

  it('does not synthesize a missing element ID when a manifest is present', () => {
    const parsedModel = parseYaml(modelText);
    delete parsedModel.model.elements[0].tag;
    const missingElementIdModel = stringifyYaml(parsedModel);
    const value = manifest();
    value.artifacts[0].sha256 = textFileHash(missingElementIdModel);
    value.artifacts[0].size = new TextEncoder().encode(missingElementIdModel).length;

    expect(errorCodes(parseWithManifest(value, missingElementIdModel)))
      .toContain('E_LINE_ID_INVALID');
  });

  it('stops when an artifact hash does not match the selected file', () => {
    const value = manifest();
    value.artifacts[1].sha256 = `sha256:${'0'.repeat(64)}`;
    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_ARTIFACT_HASH');
  });

  it('cannot validate one result artifact while parsing a stale result candidate', () => {
    const staleResult = JSON.stringify({
      analysis_kind: 'modal',
      num_modes: 1,
      result: {
        frequencies_hz: [999],
        mode_shapes_full: fullMode,
      },
    });
    const value = manifest();

    expect(() => parseFloorDataSource([
      { name: 'case_calc.yaml', text: modelText },
      { name: 'stale_result.json', text: staleResult },
      { name: 'case_modal_result.json', text: resultText },
      { name: 'project_manifest.json', text: JSON.stringify(value) },
    ])).toThrow(/E_FILE_AMBIGUOUS/);
  });

  it('cannot validate one model artifact while parsing another model candidate', () => {
    const staleModel = modelText.replace('name: manifest-test', 'name: stale-model');
    const value = manifest();

    expect(() => parseFloorDataSource([
      { name: 'stale_calc.yaml', text: staleModel },
      { name: 'case_calc.yaml', text: modelText },
      { name: 'case_modal_result.json', text: resultText },
      { name: 'project_manifest.json', text: JSON.stringify(value) },
    ])).toThrow(/E_FILE_AMBIGUOUS/);
  });

  it('stops when normalization provenance is unknown', () => {
    const value = manifest({ normalization: { type: 'unknown', reference: '' } });
    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_NORMALIZATION');
  });

  it('does not invent a normalization reference for a bare string', () => {
    const value = manifest({ normalization: 'mass-normalized' });
    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_NORMALIZATION');
  });

  it('rejects conflicting standard fields and compatibility aliases', () => {
    const value = manifest();
    value.model = {
      ...value.model,
      node_order: [...value.node_order].reverse(),
      node_order_hash: `sha256:${'0'.repeat(64)}`,
      ndf: 5,
      dof_order: DOFS.slice(0, 5),
    };
    value.modal_result = {
      normalization: { type: 'unknown', reference: '' },
    };

    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_ALIAS_CONFLICT');
  });

  it('accepts equivalent standard fields and compatibility aliases', () => {
    const value = manifest();
    value.model = {
      ...value.model,
      file: value.artifacts[0].path,
      sha256: value.artifacts[0].sha256,
      size: value.artifacts[0].size,
      node_order: [...value.node_order],
      node_order_hash: value.node_order_hash,
      ndf: value.dimensions.ndf,
      dof_order: [...value.dof_order],
    };
    value.modal_result = {
      file: value.artifacts[1].path,
      sha256: value.artifacts[1].sha256,
      size: value.artifacts[1].size,
      normalization: structuredClone(value.normalization),
    };

    expect(validateFloorData(parseWithManifest(value)).errors).toEqual([]);
  });

  it('rejects conflicts in identifier, coordinate, and provenance aliases', () => {
    const value = manifest({
      case_id: 'different-case',
      coordinates: { vertical_axis: 'z', handedness: 'right' },
      provenance: { producer: 'different-generator' },
    });

    expect(errorCodes(parseWithManifest(value))).toContain('E_MANIFEST_ALIAS_CONFLICT');
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

  it('does not coerce a JSON null full-mode component to zero', () => {
    const invalidFullMode = fullMode.map((row) => [...row]);
    // JSON cannot represent Infinity and serializes it as null. The input gate
    // must reject that null instead of silently turning it into a zero mode.
    invalidFullMode[4][0] = Number.POSITIVE_INFINITY;
    const invalidResult = JSON.stringify({
      analysis_kind: 'modal',
      num_modes: 1,
      result: {
        frequencies_hz: [5.2],
        mode_shapes_full: invalidFullMode,
      },
    });
    const value = manifest();
    value.artifacts[1].sha256 = textFileHash(invalidResult);
    value.artifacts[1].size = new TextEncoder().encode(invalidResult).length;

    expect(JSON.parse(invalidResult).result.mode_shapes_full[4][0]).toBeNull();
    expect(errorCodes(parseWithManifest(value, modelText, invalidResult)))
      .toContain('E_MODE_SHAPE_NONFINITE');
  });

  it('requires num_modes to equal the exact frequency count', () => {
    expect(errorCodesForResult({
      analysis_kind: 'modal',
      num_modes: 1,
      result: {
        frequencies_hz: [5.2, 6.1],
        mode_shapes_full: fullMode,
      },
    })).toContain('E_RESULT_MODE_COUNT');
  });

  it('rejects surplus full-mode columns and rows instead of truncating them', () => {
    const dofMajorWithExtraMode = fullMode.map((row) => [...row, 0]);
    const modeMajorWithExtraMode = [
      fullMode.map((row) => row[0]),
      Array.from({ length: 12 }, () => 0),
    ];

    for (const matrix of [dofMajorWithExtraMode, modeMajorWithExtraMode]) {
      expect(errorCodesForResult({
        analysis_kind: 'modal',
        num_modes: 1,
        result: {
          frequencies_hz: [5.2],
          mode_shapes_full: matrix,
        },
      })).toContain('E_MODE_SHAPE_FULL_SIZE');
    }
  });

  it('accepts an exact mode-major full-mode matrix', () => {
    const exactModeMajor = [fullMode.map((row) => row[0])];
    const exactResult = JSON.stringify({
      analysis_kind: 'modal',
      num_modes: 1,
      result: {
        frequencies_hz: [5.2],
        mode_shapes_full: exactModeMajor,
      },
    });
    const value = manifest();
    value.artifacts[1].sha256 = textFileHash(exactResult);
    value.artifacts[1].size = new TextEncoder().encode(exactResult).length;
    const data = parseWithManifest(value, modelText, exactResult);

    expect(validateFloorData(data).errors).toEqual([]);
    expect(data.modes.get(1).get(1)).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseAnalysisPair, parseFloorData, parseFloorDataSource } from '../src/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const VALID = JSON.stringify({
  meta: { title: 'sample', length_unit: 'm' },
  nodes: [
    { id: 1, x: 0.0, y: 0.0, z: 0.0 },
    { id: 2, x: 6.0, y: 0.0, z: 0.0 },
    { id: 3, x: 6.0, y: 4.0, z: 0.0 },
    { id: 4, x: 0.0, y: 4.0, z: 0.0 },
  ],
  lines: [
    { id: 1, node_i: 1, node_j: 2 },
    { id: 2, node_i: 2, node_j: 3 },
  ],
  freq_hz: { 1: 5.2, 2: 8.7 },
  modes: {
    1: { 1: 0.0, 2: 0.4, 3: 1.0 }, // node 4 omitted -> uz=0
    2: { 1: 1.0, 2: 0.2, 3: -0.9, 4: -0.1 },
  },
});

describe('parseFloorData', () => {
  it('parses valid JSON into the documented shape', () => {
    const result = parseFloorData(VALID);
    expect(result).toHaveProperty('meta');
    expect(result).toHaveProperty('nodes');
    expect(result).toHaveProperty('nodeIdCounts');
    expect(result).toHaveProperty('lines');
    expect(result).toHaveProperty('freqHz');
    expect(result).toHaveProperty('modes');
    expect(result).toHaveProperty('phase0');
  });

  it('returns nodes as a Map<id,{id,x,y,z}>', () => {
    const { nodes } = parseFloorData(VALID);
    expect(nodes).toBeInstanceOf(Map);
    expect(nodes.size).toBe(4);
    expect(nodes.get(2)).toEqual({ id: 2, x: 6.0, y: 0.0, z: 0.0 });
  });

  it('returns lines as an Array with snake_case -> camelCase keys (node_i->nodeI, node_j->nodeJ)', () => {
    const { lines } = parseFloorData(VALID);
    expect(Array.isArray(lines)).toBe(true);
    expect(lines.length).toBe(2);
    expect(lines[0]).toEqual({ id: 1, nodeI: 1, nodeJ: 2 });
    expect(lines[1]).toEqual({ id: 2, nodeI: 2, nodeJ: 3 });
  });

  it('converts freq_hz -> freqHz as a Map<modeNum, freq> with numeric keys', () => {
    const { freqHz } = parseFloorData(VALID);
    expect(freqHz).toBeInstanceOf(Map);
    expect(freqHz.get(1)).toBe(5.2);
    expect(freqHz.get(2)).toBe(8.7);
    // numeric keys, not string
    expect([...freqHz.keys()]).toEqual([1, 2]);
  });

  it('returns modes as Map<modeNum, Map<nodeId, uz>>', () => {
    const { modes } = parseFloorData(VALID);
    expect(modes).toBeInstanceOf(Map);
    expect(modes.get(1)).toBeInstanceOf(Map);
    expect(modes.get(1).get(2)).toBe(0.4);
    expect(modes.get(2).get(3)).toBe(-0.9);
  });

  it('fills omitted nodes in a mode with uz = 0', () => {
    const { modes } = parseFloorData(VALID);
    // node 4 omitted in mode 1 -> should be filled with 0
    expect(modes.get(1).has(4)).toBe(true);
    expect(modes.get(1).get(4)).toBe(0.0);
    // all nodes present
    expect(modes.get(1).size).toBe(4);
  });

  it('counts duplicate node ids in nodeIdCounts', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 1, x: 1, y: 0, z: 0 },
        { id: 2, x: 2, y: 0, z: 0 },
      ],
      lines: [],
      freq_hz: {},
      modes: {},
    });
    const { nodeIdCounts, nodes } = parseFloorData(json);
    expect(nodeIdCounts).toBeInstanceOf(Map);
    expect(nodeIdCounts.get(1)).toBe(2);
    expect(nodeIdCounts.get(2)).toBe(1);
    // last duplicate wins in nodes Map
    expect(nodes.get(1)).toEqual({ id: 1, x: 1, y: 0, z: 0 });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseFloorData('{ not valid json')).toThrow(/JSON parse error/);
  });

  it('treats special JSON keys as data without mutating object prototypes', () => {
    const input = '{"__proto__":{"polluted":true},"nodes":[],"lines":[],"freq_hz":{},"modes":{}}';
    parseFloorData(input);
    expect({}.polluted).toBeUndefined();
  });

  it('returns phase0 as a Map when provided', () => {
    const json = JSON.stringify({
      nodes: [{ id: 1, x: 0, y: 0, z: 0 }],
      lines: [],
      freq_hz: { 1: 5 },
      modes: { 1: { 1: 1 } },
      phase0: { 1: 1.5707963267948966, 2: 0 },
    });
    const { phase0 } = parseFloorData(json);
    expect(phase0).toBeInstanceOf(Map);
    expect(phase0.get(1)).toBeCloseTo(Math.PI / 2, 12);
    expect(phase0.get(2)).toBe(0);
  });

  it('returns an empty Map for phase0 when omitted (backward compat)', () => {
    const { phase0 } = parseFloorData(VALID);
    expect(phase0).toBeInstanceOf(Map);
    expect(phase0.size).toBe(0);
  });

  it('defaults missing x/y/z coordinates to 0', () => {
    const json = JSON.stringify({
      nodes: [{ id: 1 }, { id: 2, x: 3 }],
      lines: [],
      freq_hz: {},
      modes: {},
    });
    const { nodes } = parseFloorData(json);
    expect(nodes.get(1)).toEqual({ id: 1, x: 0, y: 0, z: 0 });
    expect(nodes.get(2)).toEqual({ id: 2, x: 3, y: 0, z: 0 });
  });

  it('defaults meta to {} when omitted', () => {
    const json = JSON.stringify({ nodes: [], lines: [], freq_hz: {}, modes: {} });
    const { meta } = parseFloorData(json);
    expect(meta).toEqual({});
  });

  it('parses analysis calc YAML + modal result JSON into the documented floor shape', () => {
    const modelText = readFileSync(resolve(root, 'public/Sample/Test0202_calc.yaml'), 'utf-8');
    const resultText = readFileSync(resolve(root, 'public/Sample/Test0202_calc_go_modal_result.json'), 'utf-8');
    const result = parseAnalysisPair(modelText, resultText);

    expect(result.meta.sourceFormat).toBe('analysis_model_result');
    expect(result.meta.dofOrder).toEqual(['ux', 'uy', 'uz', 'rx', 'ry', 'rz']);
    expect(result.nodes.size).toBe(76);
    expect(result.lines.length).toBe(79);
    expect(result.freqHz.get(1)).toBeCloseTo(25.790631489066364, 12);
    expect(result.modes.size).toBe(6);
  });

  it('restores full 1-node 6-DOF mode values and reduces uz for display', () => {
    const modelText = readFileSync(resolve(root, 'public/Sample/Test0202_calc.yaml'), 'utf-8');
    const resultText = readFileSync(resolve(root, 'public/Sample/Test0202_calc_go_modal_result.json'), 'utf-8');
    const result = parseAnalysisPair(modelText, resultText);

    expect(result.modesFull.get(1).get(101)).toEqual({
      ux: -0.00004092947669443527,
      uy: -0.019617715042077072,
      uz: -0.09092163185134622,
      rx: -0.0026484215045320873,
      ry: 0.00030584192968966195,
      rz: -0.000052508253248257616,
    });
    expect(result.modes.get(1).get(101)).toBe(result.modesFull.get(1).get(101).uz);
  });

  it('selects paired calc/result files from UI-style file sources', () => {
    const modelText = readFileSync(resolve(root, 'public/Sample/Test0202_calc.yaml'), 'utf-8');
    const resultText = readFileSync(resolve(root, 'public/Sample/Test0202_calc_go_modal_result.json'), 'utf-8');
    const result = parseFloorDataSource([
      { name: 'Test0202_calc.yaml', text: modelText },
      { name: 'Test0202_calc_go_modal_result.json', text: resultText },
    ]);

    expect(result.nodes.has(3034)).toBe(true);
    expect(result.modes.get(3).get(3034)).toBeCloseTo(2.3495926756365946, 12);
  });

  it('does not mistake a result filename containing "_calc" for the model file', () => {
    const modelText = readFileSync(resolve(root, 'public/Sample/Test0202_calc.yaml'), 'utf-8');
    const resultText = readFileSync(resolve(root, 'public/Sample/Test0202_calc_go_modal_result.json'), 'utf-8');
    const result = parseFloorDataSource([
      { name: 'Test0202_calc_go_modal_result.json', text: resultText },
      { name: 'Test0202_calc.yaml', text: modelText },
    ]);

    expect(result.nodes.size).toBe(76);
    expect(result.modes.get(1).get(101)).toBeCloseTo(-0.09092163185134622, 12);
  });

  it('loads the bundled Test0202 manifest and applies its explicit SI conversion', () => {
    const modelText = readFileSync(resolve(root, 'public/Sample/Test0202_calc.yaml'), 'utf-8');
    const resultText = readFileSync(resolve(root, 'public/Sample/Test0202_calc_go_modal_result.json'), 'utf-8');
    const manifestText = readFileSync(resolve(root, 'public/Sample/Test0202_manifest.json'), 'utf-8');
    const result = parseFloorDataSource([
      { name: 'Test0202_calc.yaml', text: modelText },
      { name: 'Test0202_calc_go_modal_result.json', text: resultText },
      { name: 'Test0202_manifest.json', text: manifestText },
    ]);

    expect(result.contract.schemaVersion).toBe('floorvib-project/1');
    expect(result.contract.errors).toEqual([]);
    expect(result.meta.lengthUnit).toBe('m');
    expect(result.nodes.get(1).z).toBeCloseTo(2.8, 12);
  });
});

import { describe, it, expect } from 'vitest';
import { parseFloorData } from '../src/parser.js';

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
});

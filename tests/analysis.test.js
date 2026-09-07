import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseFloorData } from '../src/parser.js';
import { compareModes, computeResponsePeaks, getNodeHistory, getDataIdentity } from '../src/analysis.js';

const read = (name) => parseFloorData(readFileSync(new URL(`../public/Sample/${name}`, import.meta.url), 'utf8'));
const modes = (vectors) => {
  const data = read('sample_case.json');
  data.modes = new Map(vectors.map((values, index) => [index + 1, new Map(values.map((v, i) => [i + 1, v]))]));
  data.freqHz = new Map(vectors.map((_, i) => [i + 1, 5 + i]));
  return data;
};

describe('response histories and peaks', () => {
  it('preserves original samples, signed peaks and irregular times', () => {
    const data = read('response_case.json');
    data.response.times = [0, 0.013, 0.29, 0.7, 2];
    const history = getNodeHistory(data, 5);
    expect(history).toEqual(data.response.times.map((time, i) => ({ time, value: data.response.values[i][4] })));
    const peaks = computeResponsePeaks(data);
    expect(peaks.global).toEqual({ nodeId: 5, value: -0.11, maxAbs: 0.11, time: 0.29 });
    expect(peaks.nodes.find((row) => row.nodeId === 5)).toMatchObject({ min: -0.11, max: 0.082, timeOfMax: 0.013 });
  });

  it('uses earliest time then numeric ID for ties and supports one zero frame', () => {
    const data = read('response_case.json');
    data.response.times = [2];
    data.response.values = [Array(9).fill(0)];
    expect(computeResponsePeaks(data).global).toEqual({ nodeId: 1, value: 0, maxAbs: 0, time: 2 });
    data.response.times = [2, 5];
    data.response.values = [Array(9).fill(0), Array(9).fill(0)];
    data.response.values[0][2] = -4;
    data.response.values[1][0] = 4;
    expect(computeResponsePeaks(data).global).toMatchObject({ nodeId: 3, value: -4, time: 2 });
    expect(() => getNodeHistory(data, 99)).toThrow('E_ANALYSIS_NODE');
    expect(() => computeResponsePeaks(read('sample_case.json'))).toThrow('E_ANALYSIS_RESPONSE');
  });
});

describe('vertical-component MAC', () => {
  it('handles identity, sign reversal, scaling, orthogonality and zero vectors', () => {
    const a = modes([[1, 1, 0, 0]]);
    const b = modes([[1, 1, 0, 0], [-1, -1, 0, 0], [1e200, 1e200, 0, 0], [1, -1, 0, 0], [0, 0, 0, 0]]);
    expect(compareModes(a, b).rows.map((r) => r.mac)).toEqual([1, 1, 1, 0, null]);
  });

  it('matches IDs independently of input order and rejects incompatible geometry, units and axes', () => {
    const a = modes([[1, 1, 0, 0]]), b = modes([[1, 1, 0, 0]]);
    b.nodes = new Map([...b.nodes].reverse());
    expect(compareModes(a, b).rows[0].mac).toBe(1);
    b.nodes.get(1).x = 0.001;
    expect(() => compareModes(a, b)).toThrow('E_COMPARE_COORDINATES');
    b.nodes.get(1).x = 0;
    b.meta.lengthUnit = 'mm';
    expect(() => compareModes(a, b)).toThrow('E_COMPARE_UNITS');
    b.meta.lengthUnit = 'm';
    b.meta.verticalDof = 'uy';
    expect(() => compareModes(a, b)).toThrow('E_COMPARE_COORDINATES');
    b.meta.verticalDof = 'uz';
    b.nodes.delete(1);
    expect(() => compareModes(a, b)).toThrow('E_COMPARE_NODES');
  });
});

it('display-settings identity includes numerical content and ignores Map insertion order', () => {
  const a = read('sample_case.json'), b = read('sample_case.json');
  b.nodes = new Map([...b.nodes].reverse());
  expect(getDataIdentity(a)).toBe(getDataIdentity(b));
  b.modes.get(1).set(1, 123);
  expect(getDataIdentity(a)).not.toBe(getDataIdentity(b));
  const c = read('response_case.json'), d = read('response_case.json');
  d.response.values[0][0] = 1;
  expect(getDataIdentity(c)).not.toBe(getDataIdentity(d));
});

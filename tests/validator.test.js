import { describe, it, expect } from 'vitest';
import { validateFloorData } from '../src/validator.js';

function makeNodes(arr) {
  const m = new Map();
  for (const n of arr) m.set(n.id, n);
  return m;
}

/** Build a valid baseline dataset (uniform z, planar). */
function validData() {
  const nodes = makeNodes([
    { id: 1, x: 0, y: 0, z: 0 },
    { id: 2, x: 6, y: 0, z: 0 },
    { id: 3, x: 6, y: 4, z: 0 },
    { id: 4, x: 0, y: 4, z: 0 },
  ]);
  const nodeIdCounts = new Map([[1, 1], [2, 1], [3, 1], [4, 1]]);
  const lines = [
    { id: 1, nodeI: 1, nodeJ: 2 },
    { id: 2, nodeI: 2, nodeJ: 3 },
  ];
  const freqHz = new Map([[1, 5.2], [2, 8.7]]);
  const modes = new Map([
    [1, new Map([[1, 0.0], [2, 0.4], [3, 1.0], [4, 0.5]])],
    [2, new Map([[1, 1.0], [2, 0.2], [3, -0.9], [4, -0.1]])],
  ]);
  const phase0 = new Map();
  return { nodes, nodeIdCounts, lines, freqHz, modes, phase0 };
}

const codes = (items) => items.map((i) => i.code);

describe('validateFloorData', () => {
  it('returns no errors for valid data', () => {
    const { errors } = validateFloorData(validData());
    expect(errors).toEqual([]);
  });

  it('formats messages as "CODE: ..."', () => {
    const d = validData();
    d.lines = [{ id: 1, nodeI: 99, nodeJ: 2 }];
    const { errors } = validateFloorData(d);
    expect(errors.length).toBeGreaterThan(0);
    for (const e of errors) {
      expect(e.message.startsWith(`${e.code}: `)).toBe(true);
    }
  });

  it('E_MISSING_KEY when a required key is missing', () => {
    const d = validData();
    delete d.nodes;
    const { errors } = validateFloorData(d);
    expect(codes(errors)).toContain('E_MISSING_KEY');
  });

  it('E_NODES_EMPTY for empty nodes Map', () => {
    const d = validData();
    d.nodes = new Map();
    const { errors } = validateFloorData(d);
    expect(codes(errors)).toContain('E_NODES_EMPTY');
  });

  it('E_NODE_DUPLICATE when nodeIdCounts has a count > 1', () => {
    const d = validData();
    d.nodeIdCounts = new Map([[1, 2], [2, 1], [3, 1], [4, 1]]);
    const { errors } = validateFloorData(d);
    expect(codes(errors)).toContain('E_NODE_DUPLICATE');
  });

  it('E_LINE_NODE_UNDEF when a line references an undefined node', () => {
    const d = validData();
    d.lines = [{ id: 1, nodeI: 1, nodeJ: 999 }];
    const { errors } = validateFloorData(d);
    expect(codes(errors)).toContain('E_LINE_NODE_UNDEF');
  });

  it('E_LINE_SELF_LOOP when nodeI === nodeJ', () => {
    const d = validData();
    d.lines = [{ id: 1, nodeI: 2, nodeJ: 2 }];
    const { errors } = validateFloorData(d);
    expect(codes(errors)).toContain('E_LINE_SELF_LOOP');
  });

  it('E_FREQ_NON_POSITIVE when freq <= 0', () => {
    const d = validData();
    d.freqHz = new Map([[1, 0], [2, 8.7]]);
    const { errors } = validateFloorData(d);
    expect(codes(errors)).toContain('E_FREQ_NON_POSITIVE');
  });

  it('E_MODE_FREQ_MISMATCH when modes and freqHz mode sets differ', () => {
    const d = validData();
    // freqHz missing mode 2 but modes has mode 2
    d.freqHz = new Map([[1, 5.2]]);
    const { errors } = validateFloorData(d);
    expect(codes(errors)).toContain('E_MODE_FREQ_MISMATCH');
  });

  it('W_FREQ_HIGH warning when freq > 30 Hz', () => {
    const d = validData();
    d.freqHz = new Map([[1, 35.0], [2, 8.7]]);
    const { warnings } = validateFloorData(d);
    expect(codes(warnings)).toContain('W_FREQ_HIGH');
  });

  it('W_MODE_ALL_ZERO warning when a mode is all zeros', () => {
    const d = validData();
    d.modes = new Map([
      [1, new Map([[1, 0], [2, 0], [3, 0], [4, 0]])],
      [2, new Map([[1, 1.0], [2, 0.2], [3, -0.9], [4, -0.1]])],
    ]);
    const { warnings } = validateFloorData(d);
    expect(codes(warnings)).toContain('W_MODE_ALL_ZERO');
  });

  it('E_PHASE0_INVALID for a non-finite phase0 value', () => {
    const d = validData();
    d.phase0 = new Map([[1, NaN]]);
    const { errors } = validateFloorData(d);
    expect(codes(errors)).toContain('E_PHASE0_INVALID');
  });

  it('W_PHASE0_UNKNOWN_MODE when phase0 references a mode not in modes', () => {
    const d = validData();
    d.phase0 = new Map([[99, 0.5]]);
    const { warnings } = validateFloorData(d);
    expect(codes(warnings)).toContain('W_PHASE0_UNKNOWN_MODE');
  });
});

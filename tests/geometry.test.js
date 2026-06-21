import { describe, it, expect } from 'vitest';
import { computeFloorMetrics, toThree, setThreePosition } from '../src/geometry.js';
import { A_REF_DIVISOR } from '../src/constants.js';

function makeNodes(arr) {
  const m = new Map();
  for (const n of arr) m.set(n.id, n);
  return m;
}

describe('computeFloorMetrics', () => {
  it('computes min/max/center/lFloor/aRef for a rectangular floor', () => {
    const nodes = makeNodes([
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 6, y: 0, z: 0 },
      { id: 3, x: 6, y: 4, z: 0 },
      { id: 4, x: 0, y: 4, z: 0 },
    ]);
    const m = computeFloorMetrics(nodes);
    expect(m.minX).toBe(0);
    expect(m.maxX).toBe(6);
    expect(m.minY).toBe(0);
    expect(m.maxY).toBe(4);
    expect(m.minZ).toBe(0);
    expect(m.maxZ).toBe(0);
    expect(m.centerX).toBe(3);
    expect(m.centerY).toBe(2);
    expect(m.centerZ).toBe(0);
    // L_floor = max(rangeX=6, rangeY=4) = 6
    expect(m.lFloor).toBe(6);
    expect(m.aRef).toBeCloseTo(6 / A_REF_DIVISOR, 12);
  });

  it('uses rangeY when it exceeds rangeX', () => {
    const nodes = makeNodes([
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 2, y: 10, z: 0 },
    ]);
    const m = computeFloorMetrics(nodes);
    expect(m.lFloor).toBe(10);
  });

  it('avoids division by zero: lFloor=1 when all nodes share coordinates', () => {
    const nodes = makeNodes([
      { id: 1, x: 3, y: 3, z: 3 },
      { id: 2, x: 3, y: 3, z: 3 },
    ]);
    const m = computeFloorMetrics(nodes);
    expect(m.lFloor).toBe(1);
    expect(m.aRef).toBeCloseTo(1 / A_REF_DIVISOR, 12);
  });
});

describe('toThree', () => {
  it('maps (x,y,z) -> [y,z,x]', () => {
    expect(toThree(1, 2, 3)).toEqual([2, 3, 1]);
  });
});

describe('setThreePosition', () => {
  it('calls obj.position.set with (y, z, x)', () => {
    const calls = [];
    const obj = { position: { set: (a, b, c) => calls.push([a, b, c]) } };
    setThreePosition(obj, 1, 2, 3);
    expect(calls).toEqual([[2, 3, 1]]);
  });
});

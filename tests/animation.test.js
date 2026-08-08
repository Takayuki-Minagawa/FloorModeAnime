import { describe, it, expect } from 'vitest';
import { AnimationController } from '../src/animation.js';
import { SPEED, TWO_PI } from '../src/constants.js';

function makeNodes(arr) {
  const m = new Map();
  for (const n of arr) m.set(n.id, n);
  return m;
}

/**
 * Baseline floor data. Rectangle 6x4 -> lFloor=6, aRef=0.6.
 * Mode 1: Umax = 1.0 at node 3. Mode 2: Umax = 0.9 at node 3.
 */
function floorData(phase0 = new Map()) {
  return {
    meta: {},
    nodes: makeNodes([
      { id: 1, x: 0, y: 0, z: 0 },
      { id: 2, x: 6, y: 0, z: 0 },
      { id: 3, x: 6, y: 4, z: 0 },
      { id: 4, x: 0, y: 4, z: 0 },
    ]),
    lines: [],
    freqHz: new Map([[2, 8.7], [1, 5.2]]), // intentionally unsorted
    modes: new Map([
      [2, new Map([[1, 1.0], [2, 0.2], [3, -0.9], [4, -0.1]])],
      [1, new Map([[1, 0.0], [2, 0.4], [3, 1.0], [4, 0.5]])],
    ]),
    phase0,
  };
}

describe('AnimationController constructor', () => {
  it('exposes a sorted mode list and selects the first mode (stopped)', () => {
    const c = new AnimationController(floorData());
    expect(c.getModeList()).toEqual([1, 2]);
    expect(c.getCurrentMode()).toBe(1);
    expect(c.isPlaying()).toBe(false);
    expect(c.getTime()).toBe(0);
  });

  it('returns a copy of the mode list', () => {
    const c = new AnimationController(floorData());
    const list = c.getModeList();
    list.push(99);
    expect(c.getModeList()).toEqual([1, 2]);
  });
});

describe('setMode / play / stop', () => {
  it('setMode resets time to 0 and stops', () => {
    const c = new AnimationController(floorData());
    c.play();
    c.update(1.0);
    expect(c.getTime()).toBeGreaterThan(0);
    c.setMode(2);
    expect(c.getCurrentMode()).toBe(2);
    expect(c.getTime()).toBe(0);
    expect(c.isPlaying()).toBe(false);
  });

  it('play starts and stop preserves the current frame', () => {
    const c = new AnimationController(floorData());
    c.play();
    expect(c.isPlaying()).toBe(true);
    c.update(0.5);
    c.stop();
    const t = c.getTime();
    expect(c.isPlaying()).toBe(false);
    c.update(0.5); // no advance while stopped
    expect(c.getTime()).toBe(t);
  });
});

describe('setScale / setSpeed clamping', () => {
  it('clamps scale to [SCALE.MIN, SCALE.MAX]', () => {
    const c = new AnimationController(floorData());
    // verify via getDisplacedZ behaviour at sin=1 (quarter period)
    const f = c.getFreqHz(1); // 5.2
    const tQuarter = 1 / (4 * f); // sin(2*pi*f*t)=1
    const aRef = 0.6;
    // node 3 normalized uz = 1.0; place time at quarter period so sin=1
    c.setTime(tQuarter);
    c.setScale(100); // clamp to SCALE.MAX = 3.0
    expect(c.getDisplacedZ(3)).toBeCloseTo(3.0 * aRef * 1.0, 6);
    c.setScale(-100); // clamp to SCALE.MIN = 0.5
    expect(c.getDisplacedZ(3)).toBeCloseTo(0.5 * aRef * 1.0, 6);
  });

  it('clamps speed to [SPEED.MIN, SPEED.MAX]', () => {
    const c = new AnimationController(floorData());
    c.setSpeed(100);
    expect(c.getSpeed()).toBe(SPEED.MAX);
    c.setSpeed(-100);
    expect(c.getSpeed()).toBe(SPEED.MIN);
    c.setSpeed(1.5);
    expect(c.getSpeed()).toBe(1.5);
  });
});

describe('update advances time only when playing, scaled by speed', () => {
  it('does not advance while stopped', () => {
    const c = new AnimationController(floorData());
    c.update(1.0);
    expect(c.getTime()).toBe(0);
  });

  it('advances by deltaTime * speed while playing', () => {
    const c = new AnimationController(floorData());
    c.setSpeed(2.0);
    c.play();
    c.update(0.5);
    expect(c.getTime()).toBeCloseTo(1.0, 12); // 0.5 * 2.0
  });
});

describe('getDisplacedZ', () => {
  it('equals base z at t=0 with phi0=0', () => {
    const c = new AnimationController(floorData());
    // sin(0)=0 -> displaced z equals base z for every node
    expect(c.getDisplacedZ(1)).toBe(0);
    expect(c.getDisplacedZ(2)).toBe(0);
    expect(c.getDisplacedZ(3)).toBe(0);
  });

  it('matches z + S*aRef*(uz/Umax)*sin(2*pi*f*t + phi0)', () => {
    const c = new AnimationController(floorData());
    c.setMode(1);
    c.setScale(2.0);
    const t = 0.013;
    c.setTime(t);
    const f = 5.2;
    const aRef = 0.6;
    // node 2: uz=0.4, Umax=1.0 -> normalized 0.4
    const expected = 0 + 2.0 * aRef * 0.4 * Math.sin(TWO_PI * f * t + 0);
    expect(c.getDisplacedZ(2)).toBeCloseTo(expected, 9);
  });

  it('reflects phase0 (phi0) in the displacement', () => {
    const phi0 = Math.PI / 2; // sin(phi0)=1 at t=0
    const c = new AnimationController(floorData(new Map([[1, phi0]])));
    c.setMode(1);
    c.setScale(1.0);
    // t=0 -> sin(phi0)=1; node 3 normalized uz=1.0
    const aRef = 0.6;
    expect(c.getDisplacedZ(3)).toBeCloseTo(1.0 * aRef * 1.0 * Math.sin(phi0), 9);
    expect(c.getDisplacedZ(3)).toBeCloseTo(0.6, 9);
  });

  it('treats unlisted nodes as uz=0 (no displacement)', () => {
    const c = new AnimationController(floorData());
    c.setMode(1);
    c.setTime(0.05);
    // node id 999 does not exist -> getDisplacedZ returns 0
    expect(c.getDisplacedZ(999)).toBe(0);
  });
});

describe('setTime', () => {
  it('clamps negative time to 0', () => {
    const c = new AnimationController(floorData());
    c.setTime(-5);
    expect(c.getTime()).toBe(0);
    c.setTime(2.5);
    expect(c.getTime()).toBe(2.5);
  });
});

describe('getPeriod', () => {
  it('returns 1/f for the current mode', () => {
    const c = new AnimationController(floorData());
    c.setMode(1);
    expect(c.getPeriod()).toBeCloseTo(1 / 5.2, 12);
    expect(c.getPeriod(2)).toBeCloseTo(1 / 8.7, 12);
  });

  it('returns 0 when frequency is 0', () => {
    const data = floorData();
    data.freqHz = new Map([[1, 0], [2, 8.7]]);
    const c = new AnimationController(data);
    c.setMode(1);
    expect(c.getPeriod()).toBe(0);
  });
});

describe('getPhase', () => {
  it('returns phi0 for the mode, defaulting to 0', () => {
    const c = new AnimationController(floorData(new Map([[1, 1.23]])));
    c.setMode(1);
    expect(c.getPhase()).toBe(1.23);
    expect(c.getPhase(2)).toBe(0);
  });
});

describe('getMaxNode', () => {
  it('returns the node id with max |uz|', () => {
    const c = new AnimationController(floorData());
    expect(c.getMaxNode(1)).toBe(3); // uz 1.0
    expect(c.getMaxNode(2)).toBe(1); // uz 1.0 (abs) is first reaching max; node1=1.0 > node3 |-0.9|
  });
});

describe('getNormalizedUz', () => {
  it('returns uz/Umax in [-1,1]', () => {
    const c = new AnimationController(floorData());
    expect(c.getNormalizedUz(3, 1)).toBeCloseTo(1.0, 12); // 1.0/1.0
    expect(c.getNormalizedUz(2, 1)).toBeCloseTo(0.4, 12); // 0.4/1.0
    expect(c.getNormalizedUz(3, 2)).toBeCloseTo(-0.9 / 1.0, 12); // -0.9/Umax(=1.0 at node1)
  });

  it('returns 0 for an unknown mode', () => {
    const c = new AnimationController(floorData());
    expect(c.getNormalizedUz(1, 99)).toBe(0);
  });
});

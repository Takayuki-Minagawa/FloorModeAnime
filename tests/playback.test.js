import { describe, expect, it, vi } from 'vitest';
import { AnimationController } from '../src/animation.js';
import { playbackAction } from '../src/playback.js';

function data(response) {
  return {
    dataKind: response ? 'response' : 'mode',
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 10, y: 0, z: 0 }],
    ]),
    lines: [],
    freqHz: new Map([[1, 10], [2, 20]]),
    modes: new Map([[1, new Map([[1, 1], [2, 0.5]])], [2, new Map([[2, 1]])]]),
    response,
  };
}

const response = {
  times: [2, 2.125, 3],
  values: [[4, -2], [1, -8], [0, 0]],
  nodeOrder: [1, 2],
  quantity: 'vertical_displacement',
  unit: 'm',
};

describe('shared playback commands', () => {
  it('seeks and steps while stopping, and wraps a modal cycle backward', () => {
    const c = new AnimationController(data());
    playbackAction(c, 'play');
    expect(c.isPlaying()).toBe(true);
    playbackAction(c, 'seek', 0.025);
    expect(c.getTime()).toBe(0.025);
    expect(c.isPlaying()).toBe(false);
    playbackAction(c, 'toggle');
    expect(c.isPlaying()).toBe(true);
    playbackAction(c, 'toggle');
    expect(c.isPlaying()).toBe(false);
    playbackAction(c, 'reset');
    playbackAction(c, 'step', -1);
    expect(c.getTime()).toBeCloseTo(0.1 * 59 / 60, 12);
    playbackAction(c, 'mode', 2);
    expect(c.getTime()).toBe(0);
    expect(c.getCurrentMode()).toBe(2);
    expect(c.isPlaying()).toBe(false);
  });

  it('uses response sample times, nonzero start and clamped endpoints', () => {
    const c = new AnimationController(data(response));
    playbackAction(c, 'seek', 2.05);
    playbackAction(c, 'step', 1);
    expect(c.getTime()).toBe(2.125);
    playbackAction(c, 'step', -1);
    expect(c.getTime()).toBe(2);
    playbackAction(c, 'step', -1);
    expect(c.getTime()).toBe(2);
    playbackAction(c, 'play');
    c.update(10);
    expect(c.getTime()).toBe(3);
    expect(c.isPlaying()).toBe(false);
    playbackAction(c, 'reset');
    expect(c.getTime()).toBe(2);
    c.setObservationPeriod(4);
    expect(c.getObservationPeriod()).toBeNull();
  });
});

describe('shared frame calculation', () => {
  it('calculates the modal sine once for multiple nodes and invalidates on mode/time', () => {
    const c = new AnimationController(data());
    const sin = vi.spyOn(Math, 'sin');
    try {
      c.getDisplacedZ(1);
      c.getDisplacedZ(2);
      c.getDisplayOffset(1);
      expect(sin).toHaveBeenCalledTimes(1);
      c.setScale(2);
      c.getDisplacedZ(1);
      expect(sin).toHaveBeenCalledTimes(1);
      c.setTime(0.02);
      c.getDisplacedZ(1);
      expect(sin).toHaveBeenCalledTimes(2);
      c.setMode(2);
      c.getDisplacedZ(2);
      expect(sin).toHaveBeenCalledTimes(3);
    } finally {
      sin.mockRestore();
    }
  });

  it('shares physical values and extrema across getters, and updates maximum node after seek', () => {
    let reads = 0;
    const counted = response.values.map((frame) => new Proxy(frame, {
      get(target, key) {
        if (key === '0' || key === '1') reads++;
        return Reflect.get(target, key);
      },
    }));
    const c = new AnimationController(data({ ...response, values: counted }));
    reads = 0;
    expect(c.getMaxNode()).toBe(1);
    expect(c.getResponseValue(1)).toBe(4);
    const firstReads = reads;
    c.getCurrentResponseRange();
    c.getDisplacedZ(1);
    c.getNormalizedUz(2);
    expect(reads).toBe(firstReads);
    c.setTime(2.0625);
    expect(c.getResponseValue(1)).toBe(2.5);
    expect(c.getResponseValue(2)).toBe(-5);
    expect(c.getMaxNode()).toBe(2);
    expect(c.getCurrentResponseRange()).toEqual({ min: -5, max: 2.5 });
    c.setTime(2.125);
    expect(c.getResponseValue(2)).toBe(-8);
  });

  it('handles one sample and a zero frame deterministically', () => {
    const c = new AnimationController(data({ ...response, times: [4], values: [[0, 0]] }));
    expect(c.getMaxNode()).toBe(1);
    expect(c.getCurrentResponseRange()).toEqual({ min: 0, max: 0 });
    playbackAction(c, 'step', 1);
    expect(c.getTime()).toBe(4);
    c.play();
    c.update(1);
    expect(c.isPlaying()).toBe(false);
    expect(c.getResponseValue(1)).toBe(0);
  });
});

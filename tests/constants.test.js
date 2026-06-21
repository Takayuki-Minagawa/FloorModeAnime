import { describe, it, expect } from 'vitest';
import {
  EPS,
  TWO_PI,
  A_REF_DIVISOR,
  SCALE,
  SPEED,
  WALKING,
  FRAME_STEPS,
  THEME,
} from '../src/constants.js';

describe('constants', () => {
  it('EPS is 1e-9 (CLAUDE.md convention)', () => {
    expect(EPS).toBe(1e-9);
  });

  it('TWO_PI is 2*Math.PI', () => {
    expect(TWO_PI).toBe(2 * Math.PI);
  });

  it('A_REF_DIVISOR is 10', () => {
    expect(A_REF_DIVISOR).toBe(10);
  });

  it('SCALE range is 0.5..3.0 with default 1.0', () => {
    expect(SCALE.MIN).toBe(0.5);
    expect(SCALE.MAX).toBe(3.0);
    expect(SCALE.DEFAULT).toBe(1.0);
    expect(SCALE.MIN).toBeLessThan(SCALE.DEFAULT);
    expect(SCALE.DEFAULT).toBeLessThan(SCALE.MAX);
  });

  it('SPEED range is 0.2..2.0 with default 1.0', () => {
    expect(SPEED.MIN).toBe(0.2);
    expect(SPEED.MAX).toBe(2.0);
    expect(SPEED.DEFAULT).toBe(1.0);
    expect(SPEED.MIN).toBeLessThan(SPEED.DEFAULT);
    expect(SPEED.DEFAULT).toBeLessThan(SPEED.MAX);
  });

  it('WALKING primary band is 1.5..2.5 Hz', () => {
    expect(WALKING.primary).toEqual({ min: 1.5, max: 2.5 });
  });

  it('WALKING harmonics is a non-empty array of bands', () => {
    expect(Array.isArray(WALKING.harmonics)).toBe(true);
    expect(WALKING.harmonics.length).toBeGreaterThan(0);
    for (const band of WALKING.harmonics) {
      expect(typeof band.min).toBe('number');
      expect(typeof band.max).toBe('number');
      expect(band.min).toBeLessThan(band.max);
    }
  });

  it('FRAME_STEPS is a positive integer', () => {
    expect(Number.isInteger(FRAME_STEPS)).toBe(true);
    expect(FRAME_STEPS).toBeGreaterThan(0);
  });

  it('THEME has light and dark palettes', () => {
    expect(THEME.light).toBeDefined();
    expect(THEME.dark).toBeDefined();
    for (const key of ['clear', 'undeformed', 'deformed', 'grid']) {
      expect(typeof THEME.light[key]).toBe('number');
      expect(typeof THEME.dark[key]).toBe('number');
    }
  });
});

import { describe, it, expect } from 'vitest';
import { assessFrequency, assessModes, RISK } from '../src/assessment.js';

describe('RISK', () => {
  it('exposes high/medium/low', () => {
    expect(RISK.HIGH).toBe('high');
    expect(RISK.MEDIUM).toBe('medium');
    expect(RISK.LOW).toBe('low');
  });
});

describe('assessFrequency', () => {
  it('returns HIGH for the walking primary band (1.5-2.5 Hz)', () => {
    for (const f of [1.5, 2.0, 2.5]) {
      const r = assessFrequency(f);
      expect(r.risk).toBe(RISK.HIGH);
      expect(r.band).toContain('walking');
    }
  });

  it('returns MEDIUM for a harmonic band', () => {
    // 3.0-5.0 Hz harmonic band
    const r = assessFrequency(4.0);
    expect(r.risk).toBe(RISK.MEDIUM);
    expect(r.band).toContain('harmonic');
  });

  it('returns LOW with band=null outside all bands', () => {
    const r = assessFrequency(10.0);
    expect(r.risk).toBe(RISK.LOW);
    expect(r.band).toBeNull();
  });

  it('returns LOW/null for invalid frequencies (0, negative, NaN, non-number)', () => {
    for (const f of [0, -1, NaN, Infinity, 'x', null, undefined]) {
      const r = assessFrequency(f);
      expect(r.risk).toBe(RISK.LOW);
      expect(r.band).toBeNull();
    }
  });
});

describe('assessModes', () => {
  it('returns results in ascending mode order', () => {
    const map = new Map([
      [3, 10.0],
      [1, 2.0], // HIGH
      [2, 4.0], // MEDIUM
    ]);
    const res = assessModes(map);
    expect(res.map((r) => r.mode)).toEqual([1, 2, 3]);
    expect(res[0]).toEqual({ mode: 1, freqHz: 2.0, risk: RISK.HIGH, band: expect.any(String) });
    expect(res[1].risk).toBe(RISK.MEDIUM);
    expect(res[2].risk).toBe(RISK.LOW);
    expect(res[2].band).toBeNull();
  });

  it('returns an empty array for non-Map input', () => {
    expect(assessModes(null)).toEqual([]);
    expect(assessModes({})).toEqual([]);
  });
});

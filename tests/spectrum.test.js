import { describe, expect, it } from 'vitest';
import { computeWelchPsd } from '../src/spectrum.js';

describe('Welch physical-response spectrum', () => {
  it('finds an 8 Hz sine in uniformly sampled data and reports PSD metadata', () => {
    const samples = Array.from({ length: 512 }, (_, index) => ({
      time: index / 64,
      value: 2 * Math.sin(2 * Math.PI * 8 * index / 64),
    }));
    const result = computeWelchPsd(samples);
    expect(result.sampleRateHz).toBe(64);
    expect(result.nyquistHz).toBe(32);
    expect(result.resolutionHz).toBe(0.25);
    expect(result.segmentLength).toBe(256);
    expect(result.segments).toBe(3);
    expect(result.dominantHz).toBe(8);
    expect(result.bins.every(bin => Number.isFinite(bin.psd) && bin.psd >= 0)).toBe(true);
  });

  it('refuses short or irregular histories instead of inventing a frequency axis', () => {
    expect(() => computeWelchPsd([{ time: 0, value: 1 }])).toThrow('E_SPECTRUM_SAMPLES');
    const samples = Array.from({ length: 64 }, (_, index) => ({ time: index / 100, value: 1 }));
    samples[20].time += 0.001;
    expect(() => computeWelchPsd(samples)).toThrow('E_SPECTRUM_SPACING');
  });
});

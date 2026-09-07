// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { reduceHistory, drawHistory } from '../src/history-chart.js';

const svg = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg');

describe('peak-preserving history display', () => {
  it('preserves both bucket extrema, chronological ordering and source endpoints', () => {
    const samples = Array.from({ length: 2000 }, (_, index) => ({ time: index / 100, value: 0 }));
    samples[500].value = 20;
    samples[501].value = -30;
    samples[1700].value = 40;
    const original = JSON.stringify(samples);
    const reduced = reduceHistory(samples, 20);
    expect(reduced.length).toBeLessThanOrEqual(42);
    expect(reduced).toContain(samples[500]);
    expect(reduced).toContain(samples[501]);
    expect(reduced).toContain(samples[1700]);
    expect(reduced[0]).toBe(samples[0]);
    expect(reduced.at(-1)).toBe(samples.at(-1));
    expect(reduced.map(point => point.time)).toEqual(reduced.map(point => point.time).toSorted((a, b) => a - b));
    expect(JSON.stringify(samples)).toBe(original);
  });

  it('uses actual irregular timestamps and maps clicks to exact endpoints', () => {
    const canvas = svg();
    const samples = [{ time: 2, value: 0 }, { time: 2.1, value: -1 }, { time: 5, value: 1 }];
    const chart = drawHistory(canvas, samples, 'm/s²', 'Node 5');
    expect(canvas.querySelector('title').textContent).toBe('Node 5');
    expect(canvas.textContent).toContain('m/s²');
    expect(chart.timeAt(0)).toBe(2);
    expect(chart.timeAt(1)).toBe(5);
    expect(chart.timeAt((64 + 258) / 600)).toBe(3.5);
    chart.setTime(2.1);
    expect(Number(canvas.querySelector('.history-cursor').getAttribute('x1'))).toBeCloseTo(81.2, 8);
    expect(canvas.querySelector('.history-line').getAttribute('d')).toContain('L81.20,');
  });

  it.each([0, -4])('draws an explicit point for a single sample with value %s', value => {
    const canvas = svg();
    const sample = [{ time: 3.4, value }];
    expect(reduceHistory(sample)).toBe(sample);
    const chart = drawHistory(canvas, sample, 'm', 'Single frame');
    expect(canvas.querySelector('circle')).not.toBeNull();
    expect(chart.timeAt(0)).toBe(3.4);
    expect(chart.timeAt(1)).toBe(3.4);
    chart.setTime(3.4);
    expect(canvas.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('keeps axes, interpolation and SVG finite for large valid physical values and times', () => {
    const canvas = svg();
    const samples = [{ time: -1e308, value: -Number.MAX_VALUE }, { time: 0, value: 0 }, { time: 1e308, value: Number.MAX_VALUE }];
    const chart = drawHistory(canvas, samples, 'm', 'Large values');
    chart.setTime(0);
    expect(canvas.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(chart.timeAt((64 + 258) / 600)).toBe(0);
    expect(chart.timeAt(0)).toBe(-1e308);
    expect(chart.timeAt(1)).toBe(1e308);
    expect(canvas.querySelector('.history-line').getAttribute('d')).toContain('L322.00,');
  });
});

/** Stable fraction even when a finite endpoint span overflows. */
function fractionBetween(value, start, end) {
  if (start === end) return 0;
  const span = end - start;
  if (Number.isFinite(span)) return (value - start) / span;
  const scale = Math.max(Math.abs(start), Math.abs(end));
  return (value / scale - start / scale) / (end / scale - start / scale);
}

/** Pixel-bucket extrema preserve narrow peaks without changing exported samples. */
export function reduceHistory(samples, buckets = 400) {
  if (samples.length <= buckets * 2) return samples;
  const first = samples[0].time, last = samples.at(-1).time;
  const groups = new Map();
  for (const point of samples) {
    const bucket = Math.min(buckets - 1, Math.floor(fractionBetween(point.time, first, last) * buckets));
    const group = groups.get(bucket);
    if (!group) groups.set(bucket, { min: point, max: point });
    else { if (point.value < group.min.value) group.min = point; if (point.value > group.max.value) group.max = point; }
  }
  return [...new Set([samples[0], ...[...groups.values()].flatMap(group => [group.min, group.max]), samples.at(-1)])].sort((a, b) => a.time - b.time);
}

export function drawHistory(svg, samples, unit, title) {
  const minTime = samples[0].time, maxTime = samples.at(-1).time;
  let min = Infinity, max = -Infinity;
  for (const p of samples) { min = Math.min(min, p.value); max = Math.max(max, p.value); }
  // Work in a bounded ordinate range so finite physical values cannot overflow.
  const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
  min /= scale; max /= scale;
  const margin = Math.max((max - min) * 0.08, Math.abs(max) * .01, 1e-12);
  min -= margin; max += margin;
  const axisValue = value => Math.max(-Number.MAX_VALUE, Math.min(Number.MAX_VALUE, value * scale));
  const x = time => 64 + fractionBetween(time, minTime, maxTime) * 516;
  const y = value => 196 - (value / scale - min) / (max - min) * 160;
  svg.replaceChildren();
  const add = (tag, attributes, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([k, v]) => node.setAttribute(k, String(v)));
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node); return node;
  };
  add('title', {}, title);
  add('path', { d: 'M64,36V196H580', fill: 'none', stroke: 'currentColor' });
  add('text', { x: 8, y: 20 }, unit);
  add('text', { x: 5, y: 43 }, axisValue(max).toPrecision(3));
  add('text', { x: 5, y: 196 }, axisValue(min).toPrecision(3));
  add('text', { x: 64, y: 220 }, `${minTime.toPrecision(4)} s`);
  add('text', { x: 500, y: 220 }, `${maxTime.toPrecision(4)} s`);
  const points = reduceHistory(samples);
  add('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${x(p.time).toFixed(2)},${y(p.value).toFixed(2)}`).join(''), class: 'history-line' });
  if (samples.length === 1) add('circle', { cx: x(minTime), cy: y(samples[0].value), r: 4, fill: 'currentColor' });
  const cursor = add('line', { y1: 36, y2: 196, class: 'history-cursor' });
  return {
    setTime(time) { cursor.setAttribute('x1', x(time)); cursor.setAttribute('x2', x(time)); },
    timeAt(fraction) {
      const ratio = Math.max(0, Math.min(1, (fraction * 600 - 64) / 516));
      return ratio === 0 ? minTime : ratio === 1 ? maxTime : minTime * (1 - ratio) + maxTime * ratio;
    },
  };
}

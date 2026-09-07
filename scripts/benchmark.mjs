/* global process, global */
/** Deterministic CPU/heap workload; WebGL and browser RAF are measured separately. */
import { performance } from 'node:perf_hooks';
import { cpus, platform, release, arch } from 'node:os';
import { parseFloorData } from '../src/parser.js';
import { validateFloorData } from '../src/validator.js';
import { parseValidatedSource } from '../src/data/load-source.js';
import { AnimationController } from '../src/animation.js';
import { makeSource } from './benchmark-fixtures.mjs';

const sampleCount = 120;
const frameCount = 120;
const warmupFrames = 20;
const runs = 3;
const round = value => Math.round(value * 1000) / 1000;
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const heap = () => process.memoryUsage().heapUsed;
function timed(fn) {
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}
function benchmark(nodeCount, kind) {
  global.gc?.();
  const heapBefore = heap();
  const source = makeSource(nodeCount, kind);
  const parseMs = [], validateMs = [], controllerMs = [], fullLoadMs = [];
  let controller;
  for (let run = 0; run < runs; run++) {
    const parsed = timed(() => parseFloorData(source));
    parseMs.push(parsed.ms);
    const validation = timed(() => validateFloorData(parsed.result));
    if (validation.result.errors.length) throw new Error(JSON.stringify(validation.result.errors));
    validateMs.push(validation.ms);
    const constructed = timed(() => new AnimationController(parsed.result));
    controllerMs.push(constructed.ms);
    controller = constructed.result;
    fullLoadMs.push(timed(() => parseValidatedSource(source)).ms);
  }
  let checksum = 0;
  const frame = index => {
    controller.setTime((index + 0.37) / 60);
    for (let id = 1; id <= nodeCount; id++) {
      // Repeated access approximates line endpoints, surface and open value table.
      checksum += controller.getDisplacedZ(id);
      checksum += controller.getDisplacedZ(id);
      checksum += kind === 'response' ? controller.getResponseValue(id) : controller.getNormalizedUz(id);
    }
    checksum += controller.getMaxNode() || 0;
    if (kind === 'response') checksum += controller.getCurrentResponseRange().max;
  };
  for (let index = 0; index < warmupFrames; index++) frame(index);
  const frames = [];
  for (let index = 0; index < frameCount; index++) frames.push(timed(() => frame(index % (sampleCount - 1))).ms);
  const heapAfter = heap();
  return {
    kind, nodes: nodeCount, lines: nodeCount - 1, responseSamples: kind === 'response' ? sampleCount : 0,
    modes: kind === 'mode' ? 2 : 0, sourceBytes: new TextEncoder().encode(source).byteLength,
    medianParseMs: round(median(parseMs)), medianValidateMs: round(median(validateMs)),
    medianControllerMs: round(median(controllerMs)), medianFullLoadMs: round(median(fullLoadMs)),
    meanFrameMs: round(frames.reduce((sum, value) => sum + value, 0) / frames.length),
    medianFrameMs: round(median(frames)), p95FrameMs: round(frames.toSorted((a, b) => a - b)[Math.floor(frames.length * 0.95)]),
    heapBeforeBytes: heapBefore, heapAfterBytes: heapAfter, heapDeltaBytes: heapAfter - heapBefore,
    checksum: round(checksum),
  };
}
const results = [];
for (const nodes of [76, 1000, 10000]) {
  for (const kind of ['mode', 'response']) results.push(benchmark(nodes, kind));
}
console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, forcedGcAvailable: typeof global.gc === 'function' },
  workload: { runs, frameCount, warmupFrames, responseSamples: sampleCount, readsPerNodePerFrame: 3 },
  scope: 'CPU parse/validate/controller/full load and getter workload only. Full load includes identity and response peaks. Heap snapshots include allocation and GC variability; not retained or peak heap. Browser/WebGL/GPU costs and stopped RAF counts are excluded. No baseline speedup is claimed.',
  results,
}, null, 2));

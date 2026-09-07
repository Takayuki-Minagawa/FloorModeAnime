/* global process, Buffer */
/** Run locally: node scripts/browser-benchmark.mjs > browser-benchmark.json */
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { cpus, platform, release, arch } from 'node:os';
import { makeSource } from './benchmark-fixtures.mjs';

const viewport = { width: 1440, height: 1000 };
const round = value => Math.round(value * 1000) / 1000;
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 5174, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-precise-memory-info'] });
  const results = [];
  for (const nodes of [76, 1000, 10000]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__benchmarkFrames = [];
      const original = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => original(timestamp => {
        const start = performance.now();
        try { return callback(timestamp); }
        finally { window.__benchmarkFrames.push({ start, duration: performance.now() - start }); }
      });
    });
    await page.goto('http://127.0.0.1:5174/FloorModeAnime/');
    await page.waitForFunction(() => document.body.dataset.loadState === 'loadReady');
    const source = makeSource(nodes, 'response');
    const fileName = `benchmark-${nodes}.json`;
    const before = await page.evaluate(() => ({ time: performance.now(), heap: performance.memory?.usedJSHeapSize ?? null }));
    await page.locator('#file-input').setInputFiles({ name: fileName, mimeType: 'application/json', buffer: Buffer.from(source) });
    await page.waitForFunction(name => document.body.dataset.loadState === 'loadReady' && document.getElementById('file-name-display').textContent === name, fileName, { timeout: 60000 });
    const loaded = await page.evaluate(() => ({ time: performance.now(), heap: performance.memory?.usedJSHeapSize ?? null }));
    // Allow first upload/render and camera damping to finish before timing playback.
    await page.waitForTimeout(500);
    await page.locator('#btn-play').click();
    await page.evaluate(() => { window.__benchmarkFrames = []; });
    const playbackStart = await page.evaluate(() => performance.now());
    await page.waitForTimeout(1000);
    const playback = await page.evaluate(() => ({ time: performance.now(), frames: window.__benchmarkFrames, heap: performance.memory?.usedJSHeapSize ?? null }));
    await page.locator('#btn-stop').click();
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__benchmarkFrames = []; });
    await page.waitForTimeout(500);
    const idleFrames = await page.evaluate(() => window.__benchmarkFrames.length);
    const durations = playback.frames.map(frame => frame.duration).sort((a, b) => a - b);
    const mean = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
    results.push({
      nodes, responseSamples: 120, sourceBytes: Buffer.byteLength(source),
      loadElapsedMs: round(loaded.time - before.time),
      playbackWindowMs: round(playback.time - playbackStart), playbackRafCallbacks: durations.length,
      meanRafCallbackMs: mean === null ? null : round(mean),
      p95RafCallbackMs: durations.length ? round(durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]) : null,
      idleRafCallbacksIn500MsAfter500MsSettling: idleFrames,
      heapBeforeBytes: before.heap, heapAfterLoadBytes: loaded.heap, heapAfterPlaybackBytes: playback.heap,
      pageErrors: errors,
    });
    await page.close();
  }
  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    environment: { node: process.version, browser: `Chromium ${browser.version()}`, os: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, viewport, deviceScaleFactor: 1, graphics: 'SwiftShader software rendering', server: 'Vite development server, local port 5174' },
    scope: 'Three fresh pages, one measurement per size, default display controls and closed numerical table. Load includes Playwright file transfer, browser file reading, Worker parse/validation/aggregation, scene construction and UI. RAF callback duration includes JavaScript submission, not asynchronous GPU completion or full painted-frame latency. performance.memory is an approximate Chrome heap snapshot excluding full Worker/GPU memory. No baseline speedup or target FPS is claimed.',
    results,
  }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}

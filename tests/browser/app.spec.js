import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';

const fixture = (name) => fileURLToPath(new URL(`../../public/Sample/${name}`, import.meta.url));
const pageErrors = new WeakMap();

async function ready(page) {
  await expect(page.locator('body')).toHaveAttribute('data-load-state', 'loadReady');
  await expect(page.locator('#btn-play')).toBeEnabled();
  await expect(page.locator('.msg-error')).toHaveCount(0);
}

async function loadSample(page, name) {
  await page.locator('#file-input').setInputFiles(fixture(name));
  await expect(page.locator('#file-name-display')).toContainText(name);
  await ready(page);
}

async function setRange(page, id, value) {
  await page.locator(id).evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function downloadBytes(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  return { bytes: await readFile(await download.path()), filename: download.suggestedFilename() };
}

test.beforeEach(async ({ page }, info) => {
  const failures = [];
  pageErrors.set(page, failures);
  page.on('pageerror', (error) => failures.push(error.message));
  await page.addInitScript(() => {
    window.__requestedFrames = 0;
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      window.__requestedFrames++;
      return original(callback);
    };
  });
  if (info.title.startsWith('initial sample failure')) return;
  await page.goto('./');
  await ready(page);
  expect(failures).toEqual([]);
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'uncaught browser errors during the complete interaction').toEqual([]);
});

test('golden modal data draws WebGL, labels and supports camera presets', async ({ page }, info) => {
  await expect(page.locator('#file-name-display')).toHaveText('Test0202');
  await expect(page.locator('#mode-select option')).toHaveCount(6);
  await expect(page.locator('#freq-display')).toContainText('25.79');
  await expect(page.locator('#node-options option')).toHaveCount(76);
  const canvas = page.locator('#canvas-container canvas');
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate((element) => {
    const gl = element.getContext('webgl2');
    return { available: !!gl, lost: gl?.isContextLost(), width: element.width, height: element.height };
  })).toMatchObject({ available: true, lost: false });
  await page.locator('#btn-view-top').click();
  await page.locator('#btn-view-iso').click();
  await info.attach('golden-modal-100-percent', { body: await page.screenshot(), contentType: 'image/png' });
});

test('stopped modal time survives language switch; play, stop and mode change stay synchronized', async ({ page }) => {
  await loadSample(page, 'sample_case.json');
  await setRange(page, '#time-slider', 0.048);
  const time = await page.locator('#time-display').textContent();
  const position = await page.locator('#time-slider').inputValue();
  await page.locator('#btn-lang').click();
  await expect(page.locator('#time-slider')).toHaveValue(position);
  await expect(page.locator('#time-display')).toHaveText(time);
  await page.locator('#observation-period').selectOption('2');
  await page.locator('#btn-play').click();
  await expect(page.locator('#btn-play')).toBeDisabled();
  await page.locator('#btn-stop').click();
  await expect(page.locator('#btn-play')).toBeEnabled();
  await page.locator('#mode-select').selectOption('2');
  await expect(page.locator('#time-display')).toContainText('0.000');
  await expect(page.locator('#time-slider')).toHaveValue('0');
});

test('physical history, signed peak, envelope and original CSV agree', async ({ page }, info) => {
  await loadSample(page, 'response_case.json');
  await page.locator('#selected-node').fill('5');
  await page.locator('#selected-node').dispatchEvent('change');
  await expect(page.locator('#history-chart')).toBeVisible();
  await expect(page.locator('#history-chart path, #history-chart polyline').first()).toBeAttached();
  await expect(page.locator('#peak-values')).toContainText('0.11');
  await page.locator('#jump-peak').click();
  await expect(page.locator('#time-display')).toContainText('0.100');
  await expect(page.locator('#selected-value')).toContainText('-0.11');
  await page.locator('#show-envelope').check();
  await expect(page.locator('#display-meaning')).toContainText(/包絡|envelope/i);
  await page.locator('#show-envelope').uncheck();
  const { bytes, filename } = await downloadBytes(page, '#history-csv');
  expect(filename).toMatch(/\.csv$/);
  const csv = bytes.toString('utf8');
  expect(csv).toContain('-0.11');
  expect(csv).toContain('m/s^2');
  expect(csv).toContain('sample-physical-response');
  await info.attach('response-selected-peak', { body: await page.screenshot(), contentType: 'image/png' });
});

test('PNG contains scene, configured dimensions, labels and response annotations', async ({ page }, info) => {
  await loadSample(page, 'response_case.json');
  await page.locator('#jump-global').click();
  await page.evaluate(() => {
    window.__captureText = [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      window.__captureText.push(String(text));
      return original.call(this, text, ...args);
    };
  });
  await page.locator('#capture-section summary').click();
  await page.locator('#capture-size').selectOption('1600');
  const { bytes, filename } = await downloadBytes(page, '#btn-download');
  expect(filename).toMatch(/\.png$/);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(1600);
  expect(bytes.readUInt32BE(20)).toBe(1000);
  expect(bytes.length).toBeGreaterThan(20000);
  const annotation = await page.evaluate(() => window.__captureText.join('\n'));
  expect(annotation).toContain('sample-physical-response');
  expect(annotation).toContain('m/s^2');
  expect(annotation).toMatch(/0\.100|0\.1/);
  await info.attach('response-annotated.png', { body: bytes, contentType: 'image/png' });
});

test('display settings restore time, scale and selected node, and reject another dataset', async ({ page }) => {
  await loadSample(page, 'sample_case.json');
  await page.locator('#selected-node').fill('3');
  await page.locator('#selected-node').dispatchEvent('change');
  await setRange(page, '#scale-slider', 1.7);
  await setRange(page, '#time-slider', 0.05);
  await page.locator('#settings-section summary').click();
  const { bytes } = await downloadBytes(page, '#save-settings');
  await setRange(page, '#scale-slider', 0.5);
  await setRange(page, '#time-slider', 0);
  await page.locator('#selected-node').fill('1');
  await page.locator('#selected-node').dispatchEvent('change');
  await page.locator('#settings-file').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: bytes });
  await expect(page.locator('#scale-slider')).toHaveValue('1.7');
  await expect(page.locator('#time-display')).toContainText('0.050');
  await expect(page.locator('#selected-node')).toHaveValue('3');
  await expect(page.locator('#tools-error')).toBeEmpty();
  await loadSample(page, 'response_case.json');
  await page.locator('#settings-file').setInputFiles({ name: 'settings.json', mimeType: 'application/json', buffer: bytes });
  await expect(page.locator('#tools-error')).not.toBeEmpty();
});

test('same-case comparison displays MAC and a second synchronized WebGL view', async ({ page }) => {
  await loadSample(page, 'sample_case.json');
  await page.locator('#compare-section summary').click();
  await page.locator('#compare-files').setInputFiles(fixture('sample_case.json'));
  await expect(page.locator('#comparison-container')).toBeVisible();
  await expect(page.locator('#comparison-container canvas')).toBeVisible();
  await expect(page.locator('#mac-table')).toContainText(/1\.000|1\.00/);
  await expect(page.locator('#compare-mode option')).toHaveCount(2);
  await page.locator('#compare-mode').selectOption('2');
  await page.locator('#compare-sign').check();
  await expect(page.locator('#tools-error')).toBeEmpty();
  await page.locator('#clear-compare').click();
  await expect(page.locator('#comparison-container')).toBeHidden();
});

test('initial sample failure and invalid JSON recover through manual input', async ({ page }) => {
  await page.route('**/Sample/Test0202_calc.yaml', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-load-state', 'loadError');
  await expect(page.locator('.msg-error')).toContainText('404');
  await expect(page.locator('#btn-select-file')).toBeEnabled();
  await expect(page.locator('#btn-play')).toBeDisabled();
  await page.locator('#file-input').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.locator('.msg-error')).toContainText(/JSON|parse/i);
  await loadSample(page, 'sample_case.json');
  await expect(page.locator('#freq-display')).toContainText('5.20');
});

test('stopped view stops requesting frames and camera interaction resumes drawing', async ({ page }, info) => {
  let previous = -1, stable = 0;
  await expect.poll(async () => {
    const count = await page.evaluate(() => window.__requestedFrames);
    stable = count === previous ? stable + 1 : 0;
    previous = count;
    return stable;
  }, { intervals: [100], timeout: 10000 }).toBeGreaterThanOrEqual(3);
  const idleCount = previous;
  await page.locator('#btn-view-top').click();
  await expect.poll(() => page.evaluate(() => window.__requestedFrames)).toBeGreaterThan(idleCount);
  await info.attach('idle-frame-check', { body: JSON.stringify({ idleFrameRequests: idleCount, cameraRequests: await page.evaluate(() => window.__requestedFrames) }), contentType: 'application/json' });
});

async function supportsVideo(page) {
  return page.evaluate(() => typeof MediaRecorder !== 'undefined'
    && ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].some((type) => MediaRecorder.isTypeSupported(type)));
}

test('one-second video exports a supported format or clearly reports unsupported recording', async ({ page }, info) => {
  await loadSample(page, 'sample_case.json');
  await setRange(page, '#time-slider', 0.03);
  await page.locator('#capture-section summary').click();
  await page.locator('#video-duration').fill('1');
  const before = await page.locator('#time-display').textContent();
  if (!(await supportsVideo(page))) {
    await page.locator('#save-video').click();
    await expect(page.locator('#tools-error')).not.toBeEmpty();
    await expect(page.locator('#video-status')).not.toBeEmpty();
  } else {
    const { bytes, filename } = await downloadBytes(page, '#save-video');
    expect(filename).toMatch(/\.(webm|mp4)$/);
    expect(bytes.length).toBeGreaterThan(1000);
    await info.attach(filename, { body: bytes, contentType: filename.endsWith('.webm') ? 'video/webm' : 'video/mp4' });
  }
  await expect(page.locator('body')).toHaveAttribute('data-recording', 'false');
  await expect(page.locator('#time-display')).toHaveText(before);
  await expect(page.locator('#btn-play')).toBeEnabled();
});

test('cancelling video restores stopped time and controls without a download', async ({ page }) => {
  await loadSample(page, 'sample_case.json');
  await page.locator('#capture-section summary').click();
  await page.locator('#video-duration').fill('10');
  const before = await page.locator('#time-display').textContent();
  const downloads = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.locator('#save-video').click();
  if (await supportsVideo(page)) {
    await expect(page.locator('body')).toHaveAttribute('data-recording', 'true');
    await expect(page.locator('#selected-node')).toBeDisabled();
    await expect(page.locator('#file-input')).toBeDisabled();
    await expect(page.locator('#time-slider')).toBeDisabled();
    await expect(page.locator('#selected-node')).toHaveValue('1');
    await page.locator('#cancel-video').click();
  } else await expect(page.locator('#tools-error')).not.toBeEmpty();
  await expect(page.locator('body')).toHaveAttribute('data-recording', 'false');
  await expect(page.locator('#time-display')).toHaveText(before);
  await expect(page.locator('#btn-play')).toBeEnabled();
  await expect(page.locator('#save-video')).toBeEnabled();
  await expect(page.locator('#selected-node')).toHaveValue('1');
  expect(downloads).toEqual([]);
});

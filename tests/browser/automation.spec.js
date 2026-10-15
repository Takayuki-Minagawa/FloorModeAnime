// 自動操作向け入口（URL パラメータ・公開 API・サンプル選択・貼り付け読込）と
// アクセシビリティ（axe-core, WCAG 2.1 AA）の画面テスト。
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixture = (name) => fileURLToPath(new URL(`../../public/Sample/${name}`, import.meta.url));
const pageErrors = new WeakMap();

async function ready(page) {
  await expect(page.locator('body')).toHaveAttribute('data-load-state', 'loadReady');
  await expect(page.locator('#btn-play')).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  const failures = [];
  pageErrors.set(page, failures);
  page.on('pageerror', (error) => failures.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page), 'uncaught browser errors during the complete interaction').toEqual([]);
});

test('URL parameters set the initial state and the public API drives and reports it', async ({ page }) => {
  await page.goto('./?sample=sample_case&mode=2&t=0.03&view=top&node=3&lang=en&theme=dark&scale=2');
  await ready(page);
  await expect(page.locator('#file-name-display')).toHaveText('sample_case');
  await expect(page.locator('#mode-select')).toHaveValue('2');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveAttribute('data-selected-node', '3');
  await expect(page.locator('body')).toHaveAttribute('data-mode', '2');
  await expect(page.locator('#scale-value')).toHaveText('2.0');
  await expect(page.locator('#load-summary')).toContainText('4 nodes');
  await expect(page.locator('#btn-theme')).toHaveAttribute('aria-pressed', 'true');

  const state = await page.evaluate(() => window.floorModeAnime.getState());
  expect(state).toMatchObject({ ready: true, dataKind: 'mode', mode: 2, selectedNode: 3, playing: false, lang: 'en', theme: 'dark', nodeCount: 4 });
  expect(state.time).toBeCloseTo(0.03, 6);
  expect(Number(await page.locator('#time-slider').inputValue())).toBeCloseTo(0.03, 6);

  expect(await page.evaluate(() => window.floorModeAnime.setMode(1))).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-mode', '1');
  await page.evaluate(() => window.floorModeAnime.play());
  await expect(page.locator('body')).toHaveAttribute('data-playing', 'true');
  await page.evaluate(() => window.floorModeAnime.stop());
  await expect(page.locator('body')).toHaveAttribute('data-playing', 'false');
  expect(await page.evaluate(() => window.floorModeAnime.setTime(0.05))).toBe(true);
  await expect(page.locator('#time-display')).toHaveText('t = 0.050 s');

  expect(await page.evaluate(() => window.floorModeAnime.loadSample('response_case'))).toBe(true);
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-data-kind', 'response');
  await expect(page.locator('#load-summary')).toContainText('vertical_acceleration');
});

test('sample selector, pasted text and a lone YAML work or fail clearly without the file dialog', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await page.locator('#sample-select').selectOption('sample_case');
  await page.locator('#btn-load-sample').click();
  await expect(page.locator('#file-name-display')).toHaveText('sample_case');
  await ready(page);

  await page.locator('#paste-section summary').click();
  await page.locator('#paste-input').fill(await readFile(fixture('response_case.json'), 'utf8'));
  await page.locator('#btn-load-paste').click();
  await expect(page.locator('#file-name-display')).toHaveText('pasted.json');
  await ready(page);
  await expect(page.locator('body')).toHaveAttribute('data-data-kind', 'response');

  await page.locator('#file-input').setInputFiles(fixture('Test0202_calc.yaml'));
  await expect(page.locator('body')).toHaveAttribute('data-load-state', 'loadError');
  await expect(page.locator('#file-name-display')).toHaveText('Test0202_calc.yaml');
  await expect(page.locator('.msg-error')).toContainText('E_FILE_PAIR');
  await expect(page.locator('.msg-error .msg-hint')).toHaveCount(1);
  // 前のデータは保持され、操作を続けられる
  await expect(page.locator('#btn-play')).toBeEnabled();
  await expect(page.locator('body')).toHaveAttribute('data-data-kind', 'response');

  await page.locator('#sample-select').selectOption('Test0202');
  await page.locator('#btn-load-sample').click();
  await ready(page);
  await expect(page.locator('.msg-error')).toHaveCount(0);
  await expect(page.locator('#mode-select option')).toHaveCount(6);
});

test('language switch re-renders warnings, time resolution follows the period, and WCAG 2.1 AA passes', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  const summary = page.locator('#error-container summary');
  await expect(summary).toHaveText('警告 6 件（クリックで詳細）');
  await expect(page.locator('#error-container .msg-hint')).toHaveCount(6);
  await page.locator('#btn-lang').click();
  await expect(summary).toHaveText('6 warning(s) - click for details');
  await page.locator('#btn-lang').click();
  await expect(summary).toHaveText('警告 6 件（クリックで詳細）');

  // 25.79 Hz: one frame step (T/60 ≈ 0.00065 s) must be visible in the time display
  await page.locator('#btn-step-fwd').click();
  await expect(page.locator('#time-display')).toHaveText('t = 0.0006 s');
  await expect(page.locator('#frame-display')).toHaveText('コマ 1 / 60');
  await expect(page.locator('#habitability-display')).toContainText('該当なし');

  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.locator('#btn-theme').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      // 色のトランジション（0.15 s）が終わってから検査する
      await page.mouse.move(10, 10);
      await page.waitForTimeout(400);
    }
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('#canvas-container canvas')
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.data ? JSON.stringify(n.any[0].data) : ''}`).join(', ')}`), `${theme} theme`).toEqual([]);
  }
});

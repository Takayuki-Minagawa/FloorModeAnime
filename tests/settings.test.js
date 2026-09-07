// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parseFloorData } from '../src/parser.js';
import { AnimationController } from '../src/animation.js';
import { buildSettings, validateSettings } from '../src/settings.js';
import { setupAnalysisTools } from '../src/tools-ui.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = parseFloorData(readFileSync(resolve(root, 'public/Sample/sample_case.json'), 'utf8'));
const response = parseFloorData(readFileSync(resolve(root, 'public/Sample/response_case.json'), 'utf8'));
function state(floorData = data) {
  const controller = new AnimationController(floorData);
  const viewer = { getViewState: () => ({ position: [4, 4, 4], target: [0, 0, 0], up: [0, 1, 0], zoom: 1 }) };
  return buildSettings(floorData, controller, viewer, 1, { 'chk-grid': true, 'width-deformed': '3', 'color-deformed': '#ff4455' });
}

describe('portable display settings contract', () => {
  it('accepts a JSON roundtrip bound to the same numerical input', () => {
    const value = JSON.parse(JSON.stringify(state()));
    expect(validateSettings(value, data)).toBe(value);
    const responseState = state(response);
    responseState.time = response.response.times.at(-1);
    expect(validateSettings(responseState, response)).toBe(responseState);
  });

  it.each([
    ['identity', value => { value.identity = 'different-input'; }],
    ['version', value => { value.schema_version = 'floor-view-settings/2'; }],
    ['time', value => { value.time = Infinity; }],
    ['negative modal time', value => { value.time = -1; }],
    ['scale', value => { value.scale = 4; }],
    ['speed', value => { value.speed = 0; }],
    ['mode', value => { value.mode = 99; }],
    ['node', value => { value.selectedNode = 999; }],
    ['observation period', value => { value.observationPeriod = 3; }],
    ['zero camera up', value => { value.view.up = [0, 0, 0]; }],
    ['camera at target', value => { value.view.position = [...value.view.target]; }],
    ['nonfinite camera', value => { value.view.position[0] = NaN; }],
    ['boolean width', value => { value.controls['width-deformed'] = true; }],
    ['array width', value => { value.controls['width-deformed'] = [2]; }],
    ['unsafe color', value => { value.controls['color-deformed'] = 'url(example)'; }],
    ['nonboolean checkbox', value => { value.controls['chk-grid'] = 'true'; }],
    ['unknown control', value => { value.controls['file-input'] = 'anything'; }],
  ])('rejects invalid %s without mutating supplied state or loaded data', (_name, invalidate) => {
    const value = state();
    invalidate(value);
    const beforeValue = structuredClone(value), beforeData = structuredClone(data);
    expect(() => validateSettings(value, data)).toThrow('E_SETTINGS_INVALID');
    expect(value).toEqual(beforeValue);
    expect(data).toEqual(beforeData);
  });

  it('rejects response time outside the actual archive range', () => {
    const value = state(response);
    value.time = 999;
    expect(() => validateSettings(value, response)).toThrow('E_SETTINGS_INVALID');
  });
});


it('invalid settings import preserves playing frame, camera, selected node and controls', async () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');
  document.body.innerHTML = html.split('<body>')[1].split('</body>')[0].replace(/<script[\s\S]*?<\/script>/g, '');
  const viewer = { setSelectedNode: vi.fn(), onNodeSelect: vi.fn(), setFrameMetadata: vi.fn(), resize: vi.fn(), setViewState: vi.fn() };
  const controller = new AnimationController(data);
  const stop = vi.spyOn(controller, 'stop');
  const tools = setupAnalysisTools({ viewer, controller, data, requestRender: vi.fn(), beforeCapture: vi.fn() });
  try {
    controller.setTime(0.031); controller.play();
    const invalid = state(); invalid.identity = 'another-case';
    const input = document.getElementById('settings-file');
    const checkbox = document.getElementById('chk-grid');
    const checked = checkbox.checked;
    const selectedCalls = viewer.setSelectedNode.mock.calls.length;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File([JSON.stringify(invalid)], 'invalid.json', { type: 'application/json' })] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(document.getElementById('tools-error').textContent).toContain('E_SETTINGS_INVALID'));
    expect(controller.getTime()).toBe(0.031);
    expect(controller.isPlaying()).toBe(true);
    expect(stop).not.toHaveBeenCalled();
    expect(viewer.setViewState).not.toHaveBeenCalled();
    expect(viewer.setSelectedNode).toHaveBeenCalledTimes(selectedCalls);
    expect(checkbox.checked).toBe(checked);
  } finally { tools.dispose(); }
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFloorData } from '../src/parser.js';
import { AnimationController } from '../src/animation.js';
import { setupResponseComparison } from '../src/response-compare-ui.js';

const mocks = vi.hoisted(() => ({ load: vi.fn(), instances: [] }));
vi.mock('../src/loader.js', () => ({ loadFloorSource: mocks.load }));
vi.mock('../src/viewer.js', () => ({
  FloorViewer: class {
    constructor() {
      this.state = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], zoom: 1 };
      this.dispose = vi.fn(); this.resize = vi.fn(); this.render = vi.fn(() => false);
      this.updateDeformed = vi.fn((height, scalar) => { this.height = height; this.scalar = scalar; });
      this.setFrameMetadata = vi.fn(); this.setVisibility = vi.fn(); this.setThemeColors = vi.fn();
      this.savePNG = vi.fn(async () => {});
      mocks.instances.push(this);
    }
    loadFloorData() {}
    getViewState() { return structuredClone(this.state); }
    setViewState(state) { this.state = structuredClone(state); }
    setRenderRequest(callback) { this.request = callback; }
  },
}));

const read = () => parseFloorData(readFileSync('public/Sample/response_case.json', 'utf8'));

beforeEach(() => {
  mocks.instances.length = 0; mocks.load.mockReset();
  document.documentElement.dataset.theme = 'light';
  document.body.innerHTML = `<div id="comparison-container" hidden></div><span id="comparison-caption"></span>
    <details id="response-compare-section" hidden></details><input id="response-compare-files" type="file">
    <button id="clear-response-compare"></button><output id="response-compare-status"></output>
    <svg id="response-compare-chart"></svg><button id="response-compare-csv"></button>
    <button id="response-compare-png"></button><select id="capture-size"><option value="1600">1600</option></select>
    <select id="capture-background"><option value=""></option></select>
    <input id="chk-node-ids" type="checkbox" checked><input id="chk-axes" type="checkbox" checked>
    <input id="chk-grid" type="checkbox" checked><input id="chk-undeformed" type="checkbox" checked>
    <input id="chk-deformed" type="checkbox" checked>`;
});

describe('physical response comparison UI', () => {
  it('renders a signed difference on base geometry and three node histories', async () => {
    const data = read(), other = read();
    other.response.caseId = 'case-B';
    other.response.values[1][4] += 0.03;
    mocks.load.mockResolvedValue(other);
    const controller = new AnimationController(data), handlers = new Map();
    const viewer = { getViewState: () => ({ position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], zoom: 1 }),
      setViewState: vi.fn(), resize: vi.fn() };
    const error = vi.fn();
    const comparison = setupResponseComparison({ viewer, controller, data, error,
      getSelectedNode: () => 5, seek: vi.fn(), beforeCapture: vi.fn(), requestRender: vi.fn(),
      on: (target, event, handler) => handlers.set(`${target.id}:${event}`, handler) });
    await handlers.get('response-compare-files:change')({ target: { files: [{ name: 'B.json' }], value: '' } });
    controller.setTime(0.05); comparison.update();
    const secondary = mocks.instances[0];
    expect(error).not.toHaveBeenCalled();
    expect(secondary.height(5)).toBe(other.nodes.get(5).z);
    expect(secondary.scalar(5)).toBeCloseTo(0.03);
    expect(document.getElementById('response-compare-status').textContent).toContain('0.030000');
    expect(document.querySelectorAll('#response-compare-chart path.history-series-0, #response-compare-chart path.history-series-1, #response-compare-chart path.history-series-2')).toHaveLength(3);
    handlers.get('clear-response-compare:click')();
    expect(secondary.dispose).toHaveBeenCalledOnce();
    expect(document.getElementById('comparison-container').hidden).toBe(true);
  });
});

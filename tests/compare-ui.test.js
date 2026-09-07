// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFloorData } from '../src/parser.js';
import { AnimationController } from '../src/animation.js';
import { computeFloorMetrics } from '../src/geometry.js';
import { setupComparison } from '../src/compare-ui.js';

const mocks = vi.hoisted(() => ({ instances: [], load: vi.fn(), failScene: false }));
vi.mock('../src/loader.js', () => ({ loadFloorSource: mocks.load }));
vi.mock('../src/viewer.js', () => ({
  FloorViewer: class {
    constructor() {
      this.state = { position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], zoom: 1 };
      this.dark = false;
      this.visibility = {};
      this.dispose = vi.fn(); this.render = vi.fn(() => false);
      this.loadFloorData = vi.fn(() => { if (mocks.failScene) throw new Error('Scene failed'); }); this.resize = vi.fn();
      this.updateDeformed = vi.fn(getter => { this.displacedZ = getter; });
      mocks.instances.push(this);
    }
    getViewState() { return structuredClone(this.state); }
    setViewState(state) {
      if (JSON.stringify(this.state) === JSON.stringify(state)) return;
      this.state = structuredClone(state); this.request?.();
    }
    setRenderRequest(callback) { this.request = callback; }
    setThemeColors(dark) { if (this.dark !== dark) { this.dark = dark; this.request?.(); } }
    setVisibility(visibility) {
      if (JSON.stringify(this.visibility) !== JSON.stringify(visibility)) {
        this.visibility = visibility; this.request?.();
      }
    }
  },
}));

const readData = () => parseFloorData(readFileSync('public/Sample/sample_case.json', 'utf8'));

async function fixture() {
  const data = readData(), other = readData();
  other.freqHz.set(1, data.freqHz.get(1) * 3);
  const controller = new AnimationController(data);
  const viewer = {
    state: { position: [8, 9, 10], target: [1, 2, 3], up: [0, 1, 0], zoom: 1.5 },
    getViewState() { return structuredClone(this.state); },
    setViewState: vi.fn(function(state) { this.state = structuredClone(state); }),
    resize: vi.fn(),
  };
  const handlers = new Map(), requestRender = vi.fn(), error = vi.fn();
  const comparison = setupComparison({ viewer, controller, data, requestRender, error,
    on: (target, type, callback) => handlers.set(`${target.id}:${type}`, callback) });
  mocks.load.mockResolvedValue(other);
  await handlers.get('compare-files:change')({ target: { files: [{ name: 'other.json' }], value: '' } });
  expect(error).not.toHaveBeenCalled();
  return { comparison, data, other, controller, viewer, secondary: mocks.instances.at(-1), requestRender, handlers, error };
}

beforeEach(() => {
  mocks.instances.length = 0; mocks.load.mockReset(); mocks.failScene = false;
  document.documentElement.lang = 'ja';
  document.documentElement.dataset.theme = 'light';
  document.body.innerHTML = `<div id="comparison-container" hidden></div><div id="mac-table"></div>
    <select id="compare-mode"></select><span id="compare-status"></span><span id="comparison-caption"></span>
    <input id="compare-files" type="file"><button id="clear-compare"></button><input id="compare-sign" type="checkbox">
    <input id="chk-axes" type="checkbox" checked><input id="chk-grid" type="checkbox" checked>
    <input id="chk-undeformed" type="checkbox" checked><input id="chk-deformed" type="checkbox" checked>
    <input id="chk-node-ids" type="checkbox" checked>`;
});

describe('comparison synchronization', () => {
  it('shares primary camera, converges to no frame requests and propagates secondary navigation', async () => {
    const { comparison, viewer, secondary, requestRender } = await fixture();
    comparison.update();
    expect(secondary.getViewState()).toEqual(viewer.getViewState());
    requestRender.mockClear();
    comparison.update(); comparison.update();
    expect(requestRender).not.toHaveBeenCalled();
    secondary.state.position = [11, 12, 13]; secondary.request();
    comparison.update();
    expect(viewer.getViewState().position).toEqual([11, 12, 13]);
    requestRender.mockClear();
    comparison.update();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it('uses primary physical phase despite different secondary frequencies, and honors sign reversal', async () => {
    const { comparison, data, other, controller, secondary } = await fixture();
    controller.setTime(1 / (4 * controller.getFreqHz()));
    const id = controller.getMaxNode();
    const amplitude = computeFloorMetrics(data.nodes).aRef * controller.getNormalizedUz(id);
    comparison.update();
    expect(secondary.displacedZ(id) - other.nodes.get(id).z).toBeCloseTo(amplitude);
    document.getElementById('compare-sign').checked = true;
    comparison.update();
    expect(secondary.displacedZ(id) - other.nodes.get(id).z).toBeCloseTo(-amplitude);
    controller.setTime(1 / (2 * controller.getFreqHz()));
    comparison.update();
    expect(secondary.displacedZ(id) - other.nodes.get(id).z).toBeCloseTo(0);
  });

  it('clears a comparison and disposes its secondary renderer', async () => {
    const { comparison, secondary, handlers } = await fixture();
    handlers.get('clear-compare:click')();
    expect(secondary.dispose).toHaveBeenCalledOnce();
    expect(document.getElementById('comparison-container').hidden).toBe(true);
    expect(document.getElementById('mac-table').children).toHaveLength(0);
    secondary.render.mockClear();
    comparison.update();
    expect(secondary.render).not.toHaveBeenCalled();
  });

  it('honors the labels checkbox in both stopped and playing comparison views', async () => {
    const { comparison, controller, secondary } = await fixture();
    document.getElementById('chk-node-ids').checked = false;
    comparison.update();
    expect(secondary.visibility.labels).toBe(false);
    document.getElementById('chk-node-ids').checked = true;
    comparison.update();
    expect(secondary.visibility.labels).toBe(true);
    controller.play(); comparison.update();
    expect(secondary.visibility.labels).toBe(false);
    controller.stop(); comparison.update();
    expect(secondary.visibility.labels).toBe(true);
  });

  it('keeps the working comparison when replacement scene construction fails', async () => {
    const { comparison, secondary, handlers, error } = await fixture();
    mocks.failScene = true;
    await handlers.get('compare-files:change')({ target: { files: [{ name: 'broken.json' }], value: '' } });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: 'Scene failed' }));
    expect(secondary.dispose).not.toHaveBeenCalled();
    expect(mocks.instances.at(-1).dispose).toHaveBeenCalledOnce();
    expect(() => comparison.update()).not.toThrow();
    expect(secondary.render).toHaveBeenCalled();
    expect(document.getElementById('comparison-container').hidden).toBe(false);
  });
});

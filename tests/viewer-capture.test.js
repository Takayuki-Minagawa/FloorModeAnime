import { afterEach, describe, expect, it, vi } from 'vitest';
import { FloorViewer } from '../src/viewer.js';
import { PerspectiveCamera, Vector3 } from 'three';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function recordingFixture() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const canvas = { captureStream: vi.fn(() => stream) };
  class Recorder extends EventTarget {
    static isTypeSupported(type) { return type === 'video/webm'; }
    constructor(_stream, { mimeType }) { super(); this.mimeType = mimeType; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      const event = new Event('dataavailable');
      event.data = new Blob(['video']);
      this.dispatchEvent(event);
      this.dispatchEvent(new Event('stop'));
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('HTMLCanvasElement', { prototype: { captureStream: () => {} } });
  const link = { click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
  const viewer = Object.create(FloorViewer.prototype);
  Object.assign(viewer, { _controls: { enabled: true }, _frameMetadata: {}, _captureActive: false,
    _captureCanvas: vi.fn(() => canvas), getViewState: vi.fn(() => ({ saved: true })),
    setViewState: vi.fn(), _requestRender: vi.fn() });
  return { viewer, track, link };
}

describe('video recording lifecycle', () => {
  it('records a supported format, releases tracks and restores the viewer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const { viewer, track, link } = recordingFixture();
    const onFrame = vi.fn(), onProgress = vi.fn();
    const recording = viewer.recordVideo({ duration: 0.1, fps: 30, filename: 'case.mp4', onFrame, onProgress });
    expect(viewer._controls.enabled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    const blob = await recording;
    expect(blob.size).toBeGreaterThan(0);
    expect(link.download).toBe('case.webm');
    expect(link.click).toHaveBeenCalledOnce();
    expect(onFrame).toHaveBeenLastCalledWith(0.1);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(viewer.setViewState).toHaveBeenCalledWith({ saved: true });
    expect(viewer._controls.enabled).toBe(true);
    expect(viewer._captureActive).toBe(false);
  });

  it('cancels immediately during the wait without downloading partial content', async () => {
    vi.useFakeTimers();
    const { viewer, track, link } = recordingFixture();
    const abort = new AbortController();
    const recording = viewer.recordVideo({ duration: 4, signal: abort.signal });
    const rejected = expect(recording).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    await rejected;
    expect(link.click).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(viewer._controls.enabled).toBe(true);
    expect(viewer._captureActive).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up even when the frame callback throws', async () => {
    vi.useFakeTimers();
    const { viewer, track } = recordingFixture();
    let frame = 0;
    const recording = viewer.recordVideo({ duration: 1, onFrame: () => {
      if (frame++) throw new Error('frame failure');
    } });
    const rejected = expect(recording).rejects.toThrow('frame failure');
    await vi.advanceTimersByTimeAsync(40);
    await rejected;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(viewer._captureActive).toBe(false);
  });

  it('releases recording resources without touching a disposed camera', async () => {
    vi.useFakeTimers();
    const { viewer, track, link } = recordingFixture();
    const recording = viewer.recordVideo({ duration: 4 });
    const rejected = expect(recording).rejects.toMatchObject({ name: 'AbortError' });
    // Model the disposal sequence while a capture timer is pending.
    viewer._disposed = true; viewer._cancelCapture(); viewer._controls = null;
    await rejected;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(viewer.setViewState).not.toHaveBeenCalled();
    expect(link.click).not.toHaveBeenCalled();
    expect(viewer._captureActive).toBe(false);
  });
});

describe('demand-driven viewer state', () => {
  it('does not schedule frames when synchronized camera and visibility are unchanged', () => {
    const viewer = Object.create(FloorViewer.prototype);
    Object.assign(viewer, { _camera: new PerspectiveCamera(),
      _controls: { target: new Vector3(), enableDamping: true, update: vi.fn() },
      _requestRender: vi.fn(),
      _undeformedGroup: { visible: true }, _deformedGroup: { visible: true },
      _axesGroup: { visible: true }, _gridGroup: { visible: true }, _labelsGroup: { visible: false },
    });
    const state = viewer.getViewState();
    viewer.setViewState(state);
    viewer.setVisibility({ undeformed: true, deformed: true, axes: true, grid: true, labels: false });
    expect(viewer._requestRender).not.toHaveBeenCalled();
    state.position = [2, 3, 4];
    viewer.setViewState(state);
    viewer.setViewState(state);
    expect(viewer._requestRender).toHaveBeenCalledOnce();
    viewer.setVisibility({ grid: false });
    viewer.setVisibility({ grid: false });
    expect(viewer._requestRender).toHaveBeenCalledTimes(2);
  });
});

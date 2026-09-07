import { describe, it, expect, vi } from 'vitest';
import { captureSize, supportedVideoType, canvasBlob, drawCaptureAnnotations, responseColorStops, responseGradient } from '../src/capture.js';
import { Color } from 'three';

describe('capture contracts', () => {
  it('defaults to viewport and limits capture memory', () => {
    expect(captureSize(undefined, undefined, 800, 600)).toEqual({ width: 800, height: 600 });
    expect(captureSize(1920, 1080, 800, 600)).toEqual({ width: 1920, height: 1080 });
    for (const [w, h] of [[0, 600], [NaN, 600], [800.5, 600], [8192, 8192]]) {
      expect(() => captureSize(w, h)).toThrow('E_CAPTURE_SIZE');
    }
  });

  it('chooses only supported codecs and a matching filename extension', () => {
    expect(supportedVideoType(null)).toBeNull();
    expect(supportedVideoType({ isTypeSupported: () => false })).toBeNull();
    expect(supportedVideoType({ isTypeSupported: type => type === 'video/mp4' }))
      .toEqual({ mimeType: 'video/mp4', extension: 'mp4' });
    expect(supportedVideoType({ isTypeSupported: type => type === 'video/webm;codecs=vp8' }))
      .toEqual({ mimeType: 'video/webm;codecs=vp8', extension: 'webm' });
  });

  it('reports encoding failures rather than downloading an empty image', async () => {
    await expect(canvasBlob({ toBlob: callback => callback(null) })).rejects.toThrow('E_CAPTURE_BLOB');
    const blob = new Blob(['png']);
    await expect(canvasBlob({ toBlob: callback => callback(blob) })).resolves.toBe(blob);
  });

  it('includes localized metadata, projected labels, units and range in the capture', () => {
    const stops = [];
    const context = { strokeText: vi.fn(), fillText: vi.fn(), fillRect: vi.fn(),
      measureText: text => ({ width: text.length * 8 }),
      createLinearGradient: () => ({ addColorStop: (offset, color) => stops.push([offset, color]) }) };
    drawCaptureAnnotations(context, 1200, 800, {
      title: '床の応答', lines: ['ケース A', 't = 1.250 s'],
      legend: { min: -1, max: 2, unit: 'mm', label: '変位' },
    }, [{ text: '42', x: 100, y: 200 }], false);
    const texts = context.fillText.mock.calls.map(call => call[0]);
    expect(texts).toEqual(expect.arrayContaining(['42', '床の応答', 'ケース A', 't = 1.250 s', '変位 [mm]', '-1', '2']));
    expect(context.fillText).toHaveBeenCalledWith('42', 100, 200);
    expect(stops[0][0]).toBe(0);
    expect(stops.at(-1)[0]).toBe(1);
  });

  it('uses the same linear-light colors as the surface, including positive-only envelope ranges', () => {
    const stops = responseColorStops(-2, 2);
    expect(stops[0][1]).toBe(new Color(0x2554c7).getStyle());
    expect(stops[10][1]).toBe(new Color(0xf3f5f7).getStyle());
    expect(stops[20][1]).toBe(new Color(0xd52b1e).getStyle());
    expect(stops[15][1]).toBe(new Color(0xf3f5f7).lerp(new Color(0xd52b1e), 0.5).getStyle());
    expect(responseColorStops(0, 2)[0][1]).toBe(new Color(0xf3f5f7).getStyle());
    expect(new Set(responseColorStops(0, 0).map(stop => stop[1])).size).toBe(1);
    expect(responseGradient(0, 2)).toContain(`${new Color(0xf3f5f7).getStyle()} 0%`);
  });
});

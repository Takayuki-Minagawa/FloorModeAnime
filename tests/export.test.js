import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AnimationController } from '../src/animation.js';
import { buildDisplayExport, MODE_DISPLAY_CLAIM } from '../src/export.js';
import { parseFloorData } from '../src/parser.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sample = (name) => readFileSync(resolve(root, 'public/Sample', name), 'utf8');

describe('display exports', () => {
  it('labels modal CSV and JSON as normalized display coordinates, not response', () => {
    const data = parseFloorData(sample('sample_case.json'));
    const controller = new AnimationController(data);
    const csv = buildDisplayExport(controller, data, 'csv');
    const json = JSON.parse(buildDisplayExport(controller, data, 'json').content);

    expect(csv.content.split('\n')[0]).toBe(`# ${MODE_DISPLAY_CLAIM}`);
    expect(csv.content).toContain('normalized_display_z');
    expect(json.description).toBe(MODE_DISPLAY_CLAIM);
    expect(json.schema_version).toBe('floor-mode-display-export/1');
  });

  it('exports raw physical response values separately from display geometry', () => {
    const data = parseFloorData(sample('response_case.json'));
    const controller = new AnimationController(data);
    controller.setTime(0.1);
    controller.setDisplayNormalized(false);
    const json = JSON.parse(buildDisplayExport(controller, data, 'json').content);
    const center = json.records.find((record) => record.id === 5);

    expect(json.schema_version).toBe('floor-response-display-export/1');
    expect(json.quantity).toBe('vertical_acceleration');
    expect(json.unit).toBe('m/s^2');
    expect(json.display_normalized).toBe(false);
    expect(center.response_value).toBe(-0.11);
    expect(center.display_offset).toBe(center.response_value);
  });
});

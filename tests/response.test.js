import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AnimationController } from '../src/animation.js';
import { parseFloorData, parseFloorDataSource } from '../src/parser.js';
import { validateFloorData } from '../src/validator.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const responseText = readFileSync(resolve(root, 'public/Sample/response_case.json'), 'utf8');
const responseObject = () => JSON.parse(responseText);
const codes = (data) => validateFloorData(data).errors.map((item) => item.code);

describe('floor-response-archive/1', () => {
  it('parses a separate physical-response schema and derives face edges', () => {
    const data = parseFloorData(responseText);
    const result = validateFloorData(data);

    expect(result.errors).toEqual([]);
    expect(data.dataKind).toBe('response');
    expect(data.nodes.size).toBe(9);
    expect(data.faces).toHaveLength(4);
    expect(data.lines).toHaveLength(12);
    expect(data.response.quantity).toBe('vertical_acceleration');
    expect(data.response.unit).toBe('m/s^2');
  });

  it('interpolates raw archive values in time', () => {
    const controller = new AnimationController(parseFloorData(responseText));
    controller.setTime(0.075);
    // Midway from +0.082 at 0.05 s to -0.11 at 0.10 s.
    expect(controller.getResponseValue(5)).toBeCloseTo(-0.014, 12);
  });

  it('uses L/10 only for normalized shape presentation', () => {
    const controller = new AnimationController(parseFloorData(responseText));
    controller.setTime(0.1);
    // L_floor=6m, A_ref=0.6m; archive max abs=0.11.
    expect(controller.getDisplayOffset(5)).toBeCloseTo(-0.6, 12);
  });

  it('uses a symmetric archive-wide range for the diverging contour and legend', () => {
    const controller = new AnimationController(parseFloorData(responseText));
    expect(controller.getResponseRange()).toEqual({ min: -0.11, max: 0.11 });
  });

  it('matches the response archive exactly when display normalization is OFF', () => {
    const controller = new AnimationController(parseFloorData(responseText));
    controller.setTime(0.1);
    controller.setScale(3);
    controller.setDisplayNormalized(false);

    expect(controller.getDisplayOffset(5)).toBe(controller.getResponseValue(5));
    expect(controller.getDisplayOffset(5)).toBe(-0.11);
    expect(controller.getDisplacedZ(5)).toBe(-0.11);
  });

  it('steps between archive samples and stops at the final time', () => {
    const controller = new AnimationController(parseFloorData(responseText));
    controller.stepResponseFrame(1);
    expect(controller.getTime()).toBe(0.05);
    controller.play();
    controller.update(10);
    expect(controller.getTime()).toBe(0.2);
    expect(controller.isPlaying()).toBe(false);
  });

  it('stops on response unit, node-order, normalization, and finite-value violations', () => {
    const unit = responseObject();
    unit.units.response = 'mm/s^2';
    expect(codes(parseFloorData(JSON.stringify(unit)))).toContain('E_RESPONSE_UNITS');

    const order = responseObject();
    [order.node_order[0], order.node_order[1]] = [order.node_order[1], order.node_order[0]];
    expect(codes(parseFloorData(JSON.stringify(order)))).toContain('E_RESPONSE_NODE_ORDER');

    const normalization = responseObject();
    normalization.normalization.reference = '';
    expect(codes(parseFloorData(JSON.stringify(normalization))))
      .toContain('E_RESPONSE_NORMALIZATION');

    const line = responseObject();
    line.lines = [{ id: 0, node_i: 1, node_j: 2 }];
    expect(codes(parseFloorData(JSON.stringify(line)))).toContain('E_LINE_ID_INVALID');

    const finite = responseObject();
    finite.response_values[1][2] = 'Infinity';
    expect(codes(parseFloorData(JSON.stringify(finite)))).toContain('E_RESPONSE_VALUE_NONFINITE');
  });

  it('does not coerce JSON null response values or times to zero', () => {
    const valueArchive = responseObject();
    valueArchive.response_values[1][2] = Number.POSITIVE_INFINITY;
    const valueJson = JSON.stringify(valueArchive);
    expect(JSON.parse(valueJson).response_values[1][2]).toBeNull();
    expect(codes(parseFloorData(valueJson))).toContain('E_RESPONSE_VALUE_NONFINITE');

    const timeArchive = responseObject();
    timeArchive.time_s[1] = Number.POSITIVE_INFINITY;
    const timeJson = JSON.stringify(timeArchive);
    expect(JSON.parse(timeJson).time_s[1]).toBeNull();
    expect(codes(parseFloorData(timeJson))).toContain('E_RESPONSE_TIME_NONFINITE');
  });

  it('rejects response archives mixed with modal project files or another response', () => {
    const modelText = readFileSync(resolve(root, 'public/Sample/Test0202_calc.yaml'), 'utf8');
    const resultText = readFileSync(
      resolve(root, 'public/Sample/Test0202_calc_go_modal_result.json'),
      'utf8',
    );
    const manifestText = readFileSync(
      resolve(root, 'public/Sample/Test0202_manifest.json'),
      'utf8',
    );

    expect(() => parseFloorDataSource([
      { name: 'response_case.json', text: responseText },
      { name: 'Test0202_calc.yaml', text: modelText },
      { name: 'Test0202_calc_go_modal_result.json', text: resultText },
      { name: 'Test0202_manifest.json', text: manifestText },
    ])).toThrow(/E_FILE_MIXED/);

    expect(() => parseFloorDataSource([
      { name: 'first_response.json', text: responseText },
      { name: 'second_response.json', text: responseText },
    ])).toThrow(/E_FILE_MIXED/);
  });
});

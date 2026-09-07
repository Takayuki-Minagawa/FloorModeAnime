import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseFloorData } from '../src/parser.js';
import { validateFloorData } from '../src/validator.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

describe('published viewer schemas', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  it('publishes the modal manifest viewer profile as JSON Schema 2020-12', () => {
    const schema = readJson('public/schemas/floorvib-project-v1.viewer.schema.json');
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.properties.schema_version.const).toBe('floorvib-project/1');
  });

  it('publishes the physical response archive schema beside a conforming sample', () => {
    const schema = readJson('public/schemas/floor-response-archive-v1.schema.json');
    const sample = readJson('public/Sample/response_case.json');
    expect(schema.properties.schema_version.const).toBe('floor-response-archive/1');
    expect(sample.schema_version).toBe(schema.properties.schema_version.const);
    expect(schema.required.every((key) => Object.hasOwn(sample, key))).toBe(true);
  });

  it.each([
    ['floorvib-project-v1.viewer.schema.json', 'Test0202_manifest.json'],
    ['floor-response-archive-v1.schema.json', 'response_case.json'],
  ])('fully validates %s with Draft 2020-12, including nested data and unknown versions', (schemaFile, sampleFile) => {
    const schema = readJson(`public/schemas/${schemaFile}`);
    const sample = readJson(`public/Sample/${sampleFile}`);
    const validate = ajv.compile(schema);
    expect(validate(sample), JSON.stringify(validate.errors)).toBe(true);
    sample.units.length = 'mm';
    sample.units.canonical && (sample.units.canonical.length = 'mm');
    expect(validate(sample)).toBe(false);
    const unknown = { ...readJson(`public/Sample/${sampleFile}`), schema_version: 'unsupported/99' };
    expect(validate(unknown)).toBe(false);
    for (const field of schema.required) {
      const missing = readJson(`public/Sample/${sampleFile}`);
      delete missing[field];
      expect(validate(missing), `missing ${field}`).toBe(false);
    }
  });

  it('enforces response quantity units, finite numeric schema types and unique face nodes', () => {
    const validate = ajv.getSchema(readJson('public/schemas/floor-response-archive-v1.schema.json').$id)
      ?? ajv.compile(readJson('public/schemas/floor-response-archive-v1.schema.json'));
    for (const mutate of [
      (v) => { v.units.response = 'm'; },
      (v) => { v.nodes[0].x = '0'; },
      (v) => { v.response_values[0][0] = '0'; },
      (v) => { v.faces[0].node_ids = [1, 1, 2]; },
    ]) {
      const value = readJson('public/Sample/response_case.json');
      mutate(value);
      expect(validate(value)).toBe(false);
    }
  });

  it('preserves legacy coercion while response archives reject numeric strings and unknown versions', () => {
    const legacy = readJson('public/Sample/sample_case.json');
    legacy.nodes[0].x = '0';
    expect(validateFloorData(parseFloorData(JSON.stringify(legacy))).errors).toEqual([]);
    const response = readJson('public/Sample/response_case.json');
    response.nodes[0].x = '0';
    expect(validateFloorData(parseFloorData(JSON.stringify(response))).errors.some((e) => e.code === 'E_NODE_COORD_INVALID')).toBe(true);
    response.schema_version = 'floor-response-archive/2';
    expect(() => parseFloorData(JSON.stringify(response))).toThrow('E_RESPONSE_SCHEMA');
  });

  it('accepts equivalent camel/snake aliases but rejects conflicting values', () => {
    const sample = readJson('public/Sample/sample_case.json');
    sample.freqHz = sample.freq_hz;
    expect(parseFloorData(JSON.stringify(sample)).freqHz.get(1)).toBe(5.2);
    sample.freqHz = { 1: 7 };
    expect(() => parseFloorData(JSON.stringify(sample))).toThrow('E_KEY_ALIAS_CONFLICT');
    const response = readJson('public/Sample/response_case.json');
    response.schemaVersion = 'floor-response-archive/2';
    expect(() => parseFloorData(JSON.stringify(response))).toThrow('E_KEY_ALIAS_CONFLICT');
  });
});

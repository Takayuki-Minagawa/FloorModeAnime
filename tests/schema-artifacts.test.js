import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

describe('published viewer schemas', () => {
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
});

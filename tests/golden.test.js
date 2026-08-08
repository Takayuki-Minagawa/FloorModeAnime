import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFloorDataSource } from '../src/parser.js';
import { validateFloorData } from '../src/validator.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sample = (name) => readFileSync(resolve(root, 'public/Sample', name), 'utf8');
const hash = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;

const MODEL_HASH = 'sha256:5ec7539a36b16591637a94fb9eb257adcefaeba79ad629cdc8725481a84c123e';
const RESULT_HASH = 'sha256:2218062628aa168acb9d0d84dbc9eff8ba9bab632e6d32fd1ce70e468b7b3a13';
const NODE_ORDER_HASH = 'sha256:44502b98b4d77455a92b73a8ffa2ee2468c0fe8448b46d3c16d9005658724fb5';
const FREQUENCIES = [
  25.790631489066364,
  39.56317222602471,
  49.90223568935435,
  56.157363276338224,
  62.19443131063867,
  70.54191272371826,
];

describe('bundled Test0202 golden', () => {
  it('pins the copied upstream model/result byte hashes', () => {
    expect(hash(sample('Test0202_calc.yaml'))).toBe(MODEL_HASH);
    expect(hash(sample('Test0202_calc_go_modal_result.json'))).toBe(RESULT_HASH);
  });

  it('pins dimensions, node/DOF order hash, and modal frequencies', () => {
    const files = [
      { name: 'Test0202_calc.yaml', text: sample('Test0202_calc.yaml') },
      {
        name: 'Test0202_calc_go_modal_result.json',
        text: sample('Test0202_calc_go_modal_result.json'),
      },
      { name: 'Test0202_manifest.json', text: sample('Test0202_manifest.json') },
    ];
    const data = parseFloorDataSource(files);
    const validation = validateFloorData(data);

    expect(validation.errors).toEqual([]);
    expect(data.nodes.size).toBe(76);
    expect(data.lines.length).toBe(79);
    expect(data.modes.size).toBe(6);
    expect(data.contract.manifest.nodeOrderHash).toBe(NODE_ORDER_HASH);
    expect([...data.freqHz.values()]).toEqual(FREQUENCIES);
  });
});

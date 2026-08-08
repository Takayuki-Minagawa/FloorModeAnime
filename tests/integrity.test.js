import { describe, expect, it } from 'vitest';
import { canonicalJson, nodeOrderHash, sha256Hex } from '../src/integrity.js';

describe('integrity helpers', () => {
  it('matches the SHA-256 standard test vector', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('sorts object keys recursively while preserving array order', () => {
    expect(canonicalJson({ node_order: [2, 1], dof_order: ['ux', 'uz'] })).toBe(
      '{"dof_order":["ux","uz"],"node_order":[2,1]}',
    );
  });

  it('produces the upstream node/DOF hash notation', () => {
    expect(nodeOrderHash([1, 2], ['ux', 'uz'])).toBe(
      'sha256:7a07dbfa46b2ee9019148fe105cb611403b3000ddf147e636c4c31b8217645d2',
    );
  });
});

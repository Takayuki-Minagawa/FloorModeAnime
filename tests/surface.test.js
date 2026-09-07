import { describe, it, expect } from 'vitest';
import { analyzeSurface } from '../src/surface.js';

const polygon = coordinates => coordinates.map(([x, y, z = 0]) => ({ x, y, z }));
const triangleArea = (points, triangles) => triangles.reduce((sum, triangle) => {
  const [a, b, c] = triangle.map(i => points[i]);
  return sum + Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}, 0);

describe('planar surface triangulation', () => {
  it.each([false, true])('covers concave face without overlap (reversed=%s)', reverse => {
    const points = polygon([[0, 0], [2, 0], [2, 2], [1, 0.5], [0, 2]]);
    if (reverse) points.reverse();
    const result = analyzeSurface(points);
    expect(result.errors).toEqual([]);
    expect(result.triangles).toHaveLength(3);
    expect(result.area).toBeCloseTo(2.5);
    expect(triangleArea(points, result.triangles)).toBeCloseTo(2.5);
    expect(new Set(result.triangles.flat())).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('handles a convex face on a tilted local plane and large translated coordinates', () => {
    const points = polygon([[0, 0], [2, 0], [2, 2], [0, 2]]).map(p =>
      ({ x: p.x + 1e8, y: p.y + 1e8, z: p.x + p.y + 1e8 }));
    const result = analyzeSurface(points);
    expect(result.errors).toEqual([]);
    expect(result.area).toBeCloseTo(4 * Math.sqrt(3));
    expect(result.triangles).toHaveLength(2);
  });

  it.each([
    [[[0, 0], [1, 0], [2, 0]], 'E_FACE_DEGENERATE'],
    [[[0, 0], [2, 2], [0, 2], [2, 0]], 'E_FACE_SELF_INTERSECTION'],
    [[[0, 0], [2, 0], [2, 2, 1], [0, 2]], 'E_FACE_NON_PLANAR'],
    [[[0, 0], [0, 0], [2, 0], [0, 2]], 'E_FACE_DEGENERATE'],
    [[[0, 0], [3, 0], [3, 2], [1, 0], [0, 2]], 'E_FACE_SELF_INTERSECTION'],
  ])('rejects invalid polygon %#', (coordinates, code) => {
    const result = analyzeSurface(polygon(coordinates));
    expect(result.errors[0].code).toBe(code);
    expect(result.triangles).toEqual([]);
  });
});

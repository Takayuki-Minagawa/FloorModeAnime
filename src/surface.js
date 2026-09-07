import { ShapeUtils, Vector2, Vector3 } from 'three';
import { EPS } from './constants.js';

/** Validate a simple planar polygon, preserving original vertex indices.
 * Length tolerance is EPS * max(1, local bounding-box diagonal); area
 * tolerance is EPS * max(1, diagonal²). Coordinates are translated first
 * so georeferenced models do not lose precision in cross products.
 */
export function analyzeSurface(points) {
  const errors = [];
  const fail = (code, message) => ({ errors: [{ code, message }], triangles: [], area: 0 });
  if (!Array.isArray(points) || points.length < 3 || points.some(p =>
    !p || ![p.x, p.y, p.z].every(Number.isFinite))) {
    return fail('E_FACE_DEGENERATE', 'surface requires at least three finite points');
  }
  const origin = new Vector3(points[0].x, points[0].y, points[0].z);
  const vertices = points.map(p => new Vector3(p.x, p.y, p.z).sub(origin));
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  vertices.forEach(v => { min.min(v); max.max(v); });
  const scale = Math.max(1, max.distanceTo(min));
  const tolerance = EPS * scale;
  const areaTolerance = EPS * scale * scale;
  const normal = new Vector3();
  const candidate = new Vector3();
  for (let i = 1; i < vertices.length - 1; i++) {
    candidate.crossVectors(vertices[i], vertices[i + 1]);
    if (candidate.lengthSq() > normal.lengthSq()) normal.copy(candidate);
  }
  if (normal.length() <= areaTolerance) return fail('E_FACE_DEGENERATE', 'surface has zero area');
  normal.normalize();
  if (vertices.some(v => Math.abs(v.dot(normal)) > tolerance)) {
    return fail('E_FACE_NON_PLANAR', `surface departs from its plane by more than ${tolerance}`);
  }
  const axis = Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const u = new Vector3().crossVectors(normal, axis).normalize();
  const v = new Vector3().crossVectors(normal, u);
  const projected = vertices.map(p => new Vector2(p.dot(u), p.dot(v)));
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const contains = (a, b, p) => Math.abs(cross(a, b, p)) <= areaTolerance &&
    p.x >= Math.min(a.x, b.x) - tolerance && p.x <= Math.max(a.x, b.x) + tolerance &&
    p.y >= Math.min(a.y, b.y) - tolerance && p.y <= Math.max(a.y, b.y) + tolerance;
  for (let i = 0; i < projected.length; i++) {
    const a = projected[i], b = projected[(i + 1) % projected.length];
    if (a.distanceTo(b) <= tolerance) return fail('E_FACE_DEGENERATE', 'surface contains a zero-length edge');
    for (let j = i + 1; j < projected.length; j++) {
      if (j === i + 1 || (i === 0 && j === projected.length - 1)) continue;
      const c = projected[j], d = projected[(j + 1) % projected.length];
      const abC = cross(a, b, c), abD = cross(a, b, d);
      const cdA = cross(c, d, a), cdB = cross(c, d, b);
      const opposite = (x, y) => (x > areaTolerance && y < -areaTolerance) ||
        (x < -areaTolerance && y > areaTolerance);
      if ((opposite(abC, abD) && opposite(cdA, cdB)) ||
        contains(a, b, c) || contains(a, b, d) || contains(c, d, a) || contains(c, d, b)) {
        return fail('E_FACE_SELF_INTERSECTION', 'surface edges intersect or overlap');
      }
    }
  }
  const area = Math.abs(ShapeUtils.area(projected));
  if (area <= areaTolerance) return fail('E_FACE_DEGENERATE', 'surface has zero area');
  const triangles = ShapeUtils.triangulateShape(projected, []);
  const triangleArea = triangles.reduce((sum, [a, b, c]) =>
    sum + Math.abs(cross(projected[a], projected[b], projected[c])) / 2, 0);
  if (!triangles.length || Math.abs(triangleArea - area) > areaTolerance * points.length) {
    return fail('E_FACE_DEGENERATE', 'surface cannot be triangulated consistently');
  }
  return { errors, triangles, area, tolerance };
}

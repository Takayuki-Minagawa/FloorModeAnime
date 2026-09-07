import { canonicalJson } from '../integrity.js';

/** Normalize spelling only. Numeric coercion remains each adapter's policy. */
export function camelize(value, path = '$') {
  if (Array.isArray(value)) return value.map((child, index) => camelize(child, `${path}[${index}]`));
  if (value === null || typeof value !== 'object') return value;
  const entries = new Map();
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[_-]([a-z0-9])/gi, (_, ch) => ch.toUpperCase());
    const converted = camelize(child, `${path}.${key}`);
    if (entries.has(normalized)
      && canonicalJson(entries.get(normalized)) !== canonicalJson(converted)) {
      throw new Error(`E_KEY_ALIAS_CONFLICT: ${path}.${normalized} has conflicting key spellings`);
    }
    entries.set(normalized, converted);
  }
  return Object.fromEntries(entries);
}

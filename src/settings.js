import { getDataIdentity } from './analysis.js';

export const SETTING_IDS = ['chk-undeformed', 'chk-deformed', 'chk-axes', 'chk-grid', 'chk-node-ids', 'chk-highlight', 'show-envelope', 'chk-response-normalization', 'color-undeformed', 'color-deformed', 'width-undeformed', 'width-deformed'];
export function buildSettings(data, controller, viewer, selectedNode, controls) {
  return { schema_version: 'floor-view-settings/1', identity: data.identity || getDataIdentity(data),
    view: viewer.getViewState(), time: controller.getTime(), mode: controller.getCurrentMode(),
    scale: controller.getScale(), speed: controller.getSpeed(), observationPeriod: controller.getObservationPeriod(),
    selectedNode, controls };
}
export function validateSettings(value, data) {
  const fail = () => { throw new Error('E_SETTINGS_INVALID: invalid or mismatched display settings'); };
  if (!value || value.schema_version !== 'floor-view-settings/1' || value.identity !== (data.identity || getDataIdentity(data))) fail();
  if (!Number.isFinite(value.time) || !Number.isFinite(value.scale) || value.scale < .5 || value.scale > 3 || !Number.isFinite(value.speed) || value.speed < .2 || value.speed > 2) fail();
  if (data.dataKind !== 'response' && (!data.modes.has(value.mode) || value.time < 0)) fail();
  if (data.dataKind === 'response' && (value.time < data.response.times[0] || value.time > data.response.times.at(-1))) fail();
  if (value.observationPeriod !== null && (!Number.isFinite(value.observationPeriod) || ![2, 4].includes(value.observationPeriod))) fail();
  if (!data.nodes.has(value.selectedNode)) fail();
  if (!value.view || !['position', 'target', 'up'].every(key => Array.isArray(value.view[key]) && value.view[key].length === 3 && value.view[key].every(Number.isFinite)) || !Number.isFinite(value.view.zoom) || value.view.zoom <= 0) fail();
  if (value.view.up.every(n => n === 0) || value.view.position.every((n, i) => n === value.view.target[i])) fail();
  if (!value.controls || typeof value.controls !== 'object' || Array.isArray(value.controls)) fail();
  for (const [id, v] of Object.entries(value.controls)) {
    if (!SETTING_IDS.includes(id)) fail();
    if (id.startsWith('color-')) { if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/i.test(v)) fail(); }
    else if (id.startsWith('width-')) { if (!['number', 'string'].includes(typeof v) || (typeof v === 'string' && !v.trim()) || !Number.isFinite(Number(v)) || Number(v) < 1 || Number(v) > 10) fail(); }
    else if (typeof v !== 'boolean') fail();
  }
  return value;
}

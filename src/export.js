/**
 * Export builders for values currently shown by the viewer.
 *
 * Mode-shape coordinates are presentation coordinates.  They must never be
 * described as measured or calculated physical response.
 */

export const MODE_DISPLAY_CLAIM =
  'normalized display coordinates (L/10 scaled), not physical response';

export const RESPONSE_VALUE_CLAIM =
  'physical response archive values; display geometry may be normalized separately';

/**
 * Build a deterministic CSV/JSON export without touching the DOM.
 *
 * @param {import('./animation.js').AnimationController} animController
 * @param {object} floorData
 * @param {'csv'|'json'} format
 * @returns {{content:string,mime:string,ext:string}}
 */
export function buildDisplayExport(animController, floorData, format) {
  const dataKind = typeof animController.getDataKind === 'function'
    ? animController.getDataKind()
    : 'mode';
  const nodes = floorData.nodes;
  const time = animController.getTime();

  if (dataKind === 'response') {
    return buildResponseExport(animController, floorData, format, nodes, time);
  }

  const mode = animController.getCurrentMode?.()
    ?? animController.getModeList()[0]
    ?? 0;
  const records = animController.getNodeIds().map((id) => {
    const node = nodes.get(id);
    const baseZ = node?.z ?? 0;
    return {
      id,
      x: node?.x ?? 0,
      y: node?.y ?? 0,
      base_z: baseZ,
      normalized_mode_uz: animController.getNormalizedUz(id),
      normalized_display_z: animController.getDisplacedZ(id),
    };
  });

  if (format === 'json') {
    return {
      content: JSON.stringify({
        schema_version: 'floor-mode-display-export/1',
        description: MODE_DISPLAY_CLAIM,
        mode,
        time_s: time,
        display_scale: animController.getScale?.() ?? null,
        records,
      }, null, 2),
      mime: 'application/json',
      ext: 'json',
    };
  }

  const header = 'id,x,y,base_z,normalized_mode_uz,normalized_display_z';
  const lines = records.map((record) => [
    record.id,
    record.x,
    record.y,
    record.base_z,
    record.normalized_mode_uz,
    record.normalized_display_z,
  ].join(','));
  return {
    content: [`# ${MODE_DISPLAY_CLAIM}`, header, ...lines].join('\n'),
    mime: 'text/csv',
    ext: 'csv',
  };
}

function buildResponseExport(animController, floorData, format, nodes, time) {
  const quantity = animController.getResponseQuantity();
  const unit = animController.getResponseUnit();
  const normalized = animController.isDisplayNormalized();
  const records = animController.getNodeIds().map((id) => {
    const node = nodes.get(id);
    return {
      id,
      x: node?.x ?? 0,
      y: node?.y ?? 0,
      base_z: node?.z ?? 0,
      response_value: animController.getResponseValue(id),
      display_offset: animController.getDisplayOffset(id),
      display_z: animController.getDisplacedZ(id),
    };
  });

  if (format === 'json') {
    return {
      content: JSON.stringify({
        schema_version: 'floor-response-display-export/1',
        description: RESPONSE_VALUE_CLAIM,
        quantity,
        unit,
        time_s: time,
        display_normalized: normalized,
        records,
      }, null, 2),
      mime: 'application/json',
      ext: 'json',
    };
  }

  const header = 'id,x,y,base_z,response_value,response_unit,display_offset,display_z';
  const lines = records.map((record) => [
    record.id,
    record.x,
    record.y,
    record.base_z,
    record.response_value,
    unit,
    record.display_offset,
    record.display_z,
  ].join(','));
  return {
    content: [
      `# ${RESPONSE_VALUE_CLAIM}`,
      `# quantity=${quantity},unit=${unit},display_normalized=${normalized}`,
      header,
      ...lines,
    ].join('\n'),
    mime: 'text/csv',
    ext: 'csv',
  };
}

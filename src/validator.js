/** Stable validation API, preserving issue codes and collection limits. */
import { validateResponseFloorData } from './data/validate-response.js';
import { validateModalFloorData } from './data/validate-modal.js';

export function validateFloorData(data = {}) {
  return data.dataKind === 'response'
    ? validateResponseFloorData(data) : validateModalFloorData(data);
}

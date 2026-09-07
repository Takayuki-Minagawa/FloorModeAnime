import { parseFloorDataSource } from '../parser.js';
import { validateFloorData } from '../validator.js';
import { getDataIdentity, computeResponsePeaks } from '../analysis.js';

/** DOM-independent work shared by the Worker and compatibility fallback. */
export function parseValidatedSource(source, progress = () => {}) {
  progress({ stage: 'parsing', progress: 0.2 });
  const data = parseFloorDataSource(source);
  progress({ stage: 'validating', progress: 0.6 });
  const issues = validateFloorData(data);
  if (issues.errors.length) {
    const error = new Error(issues.errors.map((issue) => issue.message).join('\n'));
    error.issues = issues;
    throw error;
  }
  progress({ stage: 'aggregating', progress: 0.8 });
  data.identity = getDataIdentity(data);
  if (data.dataKind === 'response') data.peaks = computeResponsePeaks(data);
  data.validationWarnings = issues.warnings;
  progress({ stage: 'complete', progress: 1 });
  return data;
}

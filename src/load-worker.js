import { parseValidatedSource } from './data/load-source.js';

self.onmessage = ({ data: source }) => {
  try {
    const data = parseValidatedSource(source, (progress) => self.postMessage({ type: 'progress', ...progress }));
    self.postMessage({ type: 'result', data });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message, issues: error.issues });
  }
};

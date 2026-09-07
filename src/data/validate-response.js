import { EPS } from '../constants.js';
import { MAX_ERRORS, pushError } from './validation-issues.js';
import { analyzeSurface } from '../surface.js';

const RESPONSE_UNITS = {
  vertical_displacement: 'm',
  vertical_velocity: 'm/s',
  vertical_acceleration: 'm/s^2',
};

export function validateResponseFloorData(data) {
  const errors = [];
  const warnings = [];
  const { nodes, nodeIdCounts, lines, faces, response } = data;
  let limitReached;

  const add = (code, message) => {
    limitReached = pushError(errors, code, message);
    return limitReached;
  };

  if (!(nodes instanceof Map) || nodes.size === 0) {
    add('E_NODES_EMPTY', 'nodes is empty');
  } else {
    for (const [id, node] of nodes) {
      if (!Number.isInteger(id) || id <= 0) {
        if (add('E_NODE_ID_INVALID', `node id=${id} must be a positive integer`)) break;
      }
      for (const axis of ['x', 'y', 'z']) {
        if (typeof node?.[axis] !== 'number' || !Number.isFinite(node[axis])) {
          if (add('E_NODE_COORD_INVALID', `nodes[${id}].${axis}=${node?.[axis]} must be finite`)) break;
        }
      }
    }
  }
  if (nodeIdCounts instanceof Map) {
    for (const [id, count] of nodeIdCounts) {
      if (count > 1 && add('E_NODE_DUPLICATE', `node id=${id} is duplicated (${count} entries)`)) {
        break;
      }
    }
  }

  const connected = new Set();
  if (!Array.isArray(lines) || lines.length === 0) {
    add('E_LINES_EMPTY', 'response archive has no lines or derivable face edges');
  } else {
    const lineIds = new Set();
    lines.forEach((line, index) => {
      if (!Number.isInteger(line.id) || line.id <= 0) {
        add('E_LINE_ID_INVALID', `lines[${index}].id=${line.id} must be a positive integer`);
      }
      if (lineIds.has(line.id)) add('E_LINE_DUPLICATE', `lines[${index}].id=${line.id} is duplicated`);
      lineIds.add(line.id);
      connected.add(line.nodeI);
      connected.add(line.nodeJ);
      if (!nodes?.has(line.nodeI) || !nodes?.has(line.nodeJ)) {
        add('E_LINE_NODE_UNDEF', `lines[${index}] references an undefined node`);
      }
      if (line.nodeI === line.nodeJ) add('E_LINE_SELF_LOOP', `lines[${index}] is a self-loop`);
    });
  }

  if (!Array.isArray(faces) || faces.length === 0) {
    add('E_RESPONSE_FACES_EMPTY', 'faces must be a non-empty array for contour display');
  } else {
    const faceIds = new Set();
    faces.forEach((face, index) => {
      if (!Number.isInteger(face.id) || face.id <= 0) {
        add('E_FACE_ID_INVALID', `faces[${index}].id=${face.id} must be a positive integer`);
      }
      if (faceIds.has(face.id)) add('E_FACE_DUPLICATE', `faces[${index}].id=${face.id} is duplicated`);
      faceIds.add(face.id);
      if (!Array.isArray(face.nodeIds) || face.nodeIds.length < 3) {
        add('E_FACE_SIZE', `faces[${index}] must contain at least 3 node IDs`);
        return;
      }
      if (new Set(face.nodeIds).size !== face.nodeIds.length) {
        add('E_FACE_NODE_DUPLICATE', `faces[${index}] contains a repeated node ID`);
      }
      for (const nodeId of face.nodeIds) {
        connected.add(nodeId);
        if (!nodes?.has(nodeId)) add('E_FACE_NODE_UNDEF', `faces[${index}] references node ${nodeId}`);
      }
      if (face.nodeIds.every((id) => nodes?.has(id)
        && ['x', 'y', 'z'].every((axis) => Number.isFinite(nodes.get(id)[axis])))) {
        const surface = analyzeSurface(face.nodeIds.map((id) => nodes.get(id)));
        for (const issue of surface.errors) add(issue.code, `faces[${index}]: ${issue.message}`);
      }
    });
  }
  if (nodes instanceof Map) {
    for (const id of nodes.keys()) {
      if (!connected.has(id)) add('E_NODE_ISOLATED', `node id=${id} is not connected to a line or face`);
    }
  }

  if (!response || typeof response !== 'object') {
    add('E_RESPONSE_MISSING', 'response archive payload is missing');
    return { errors, warnings };
  }
  if (response.schemaVersion !== 'floor-response-archive/1') {
    add('E_RESPONSE_SCHEMA', 'schema_version must be floor-response-archive/1');
  }
  if (typeof response.caseId !== 'string' || response.caseId.trim() === '') {
    add('E_RESPONSE_CASE_ID', 'case_id must be a non-empty string');
  }
  if (response.units?.length !== 'm' || response.units?.time !== 's') {
    add('E_RESPONSE_UNITS', 'response archive must use length=m and time=s');
  }
  const expectedUnit = RESPONSE_UNITS[response.quantity];
  if (!expectedUnit) {
    add('E_RESPONSE_QUANTITY', `quantity=${response.quantity} is unsupported`);
  } else if (response.unit !== expectedUnit) {
    add('E_RESPONSE_UNITS', `${response.quantity} must use response unit ${expectedUnit}`);
  }
  const rightHanded = response.coordinates?.rightHanded === true
    || response.coordinates?.handedness === 'right';
  if (!rightHanded || response.coordinates?.verticalAxis !== 'z') {
    add('E_RESPONSE_COORDINATES', 'coordinates must be right-handed with vertical_axis=z');
  }
  if (response.normalization !== 'physical') {
    add('E_RESPONSE_NORMALIZATION', 'response archive normalization must be physical');
  } else if (typeof response.normalizationReference !== 'string'
    || response.normalizationReference.trim() === '') {
    add('E_RESPONSE_NORMALIZATION', 'physical normalization reference is required');
  }
  if (!response.provenance || typeof response.provenance !== 'object'
    || Array.isArray(response.provenance)
    || Object.keys(response.provenance).length === 0) {
    add('E_RESPONSE_PROVENANCE', 'response archive provenance is required');
  }

  const expectedOrder = nodes instanceof Map ? [...nodes.keys()] : [];
  if (!Array.isArray(response.nodeOrder) || response.nodeOrder.length === 0) {
    add('E_RESPONSE_NODE_ORDER', 'node_order must be a non-empty array');
  } else if (response.nodeOrder.length !== expectedOrder.length
    || response.nodeOrder.some((id, index) => id !== expectedOrder[index])) {
    add('E_RESPONSE_NODE_ORDER', 'node_order must exactly match nodes array order');
  } else if (new Set(response.nodeOrder).size !== response.nodeOrder.length) {
    add('E_RESPONSE_NODE_ORDER', 'node_order contains duplicate IDs');
  }

  if (!Array.isArray(response.times) || response.times.length === 0) {
    add('E_RESPONSE_TIME_EMPTY', 'time_s must be a non-empty array');
  } else {
    response.times.forEach((time, index) => {
      if (typeof time !== 'number' || !Number.isFinite(time)) {
        add('E_RESPONSE_TIME_NONFINITE', `time_s[${index}]=${time} must be finite`);
      }
      if (index > 0 && !(time - response.times[index - 1] > EPS)) {
        add('E_RESPONSE_TIME_ORDER', 'time_s must be strictly increasing');
      }
    });
  }

  if (!Array.isArray(response.values) || response.values.length === 0) {
    add('E_RESPONSE_VALUES_EMPTY', 'response_values must be a non-empty array');
  } else {
    if (response.values.length !== response.times?.length) {
      add('E_RESPONSE_DIMENSION', 'response_values row count must equal time_s length');
    }
    response.values.forEach((frame, frameIndex) => {
      if (!Array.isArray(frame) || frame.length !== response.nodeOrder?.length) {
        add('E_RESPONSE_DIMENSION', `response_values[${frameIndex}] length must equal node_order`);
        return;
      }
      frame.forEach((value, nodeIndex) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          add(
            'E_RESPONSE_VALUE_NONFINITE',
            `response_values[${frameIndex}][${nodeIndex}]=${value} must be finite`,
          );
        }
      });
    });
  }

  return { errors: errors.slice(0, MAX_ERRORS), warnings };
}

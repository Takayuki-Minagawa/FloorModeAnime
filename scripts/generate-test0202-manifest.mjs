import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseAnalysisPair } from '../src/parser.js';
import { nodeOrderHash, textFileHash } from '../src/integrity.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const sampleDir = resolve(root, 'public/Sample');
const modelName = 'Test0202_calc.yaml';
const resultName = 'Test0202_calc_go_modal_result.json';
const manifestName = 'Test0202_manifest.json';
const expectedFrequencies = [
  25.790631489066364,
  39.56317222602471,
  49.90223568935435,
  56.157363276338224,
  62.19443131063867,
  70.54191272371826,
];

const modelText = await readFile(resolve(sampleDir, modelName), 'utf8');
const resultText = await readFile(resolve(sampleDir, resultName), 'utf8');
const data = parseAnalysisPair(modelText, resultText);
const nodeOrder = [...data.nodes.keys()];
const dofOrder = data.meta.dofOrder;
const frequencies = [...data.freqHz.values()];

if (data.nodes.size !== 76 || data.lines.length !== 79) {
  throw new Error(`Test0202 dimensions changed: nodes=${data.nodes.size}, elements=${data.lines.length}`);
}
if (frequencies.length !== expectedFrequencies.length
  || frequencies.some((value, index) => Math.abs(value - expectedFrequencies[index]) > 1e-9)) {
  throw new Error(`Test0202 frequencies changed: ${JSON.stringify(frequencies)}`);
}

const byteSize = (text) => new TextEncoder().encode(text).length;
const normalization = {
  type: 'mass-normalized',
  reference: 'FEM-Struct-PyGo ModalResult: phi.T @ M @ phi = 1',
};

const manifest = {
  schema_version: 'floorvib-project/1',
  case_id: 'Test0202',
  units: {
    canonical: { length: 'm', force: 'N', mass: 'kg', time: 's' },
    source: {
      length: 'mm',
      force: 'N',
      time: 's',
      area: 'mm^2',
      second_moment: 'mm^4',
      translational_mass: 'N*s^2/mm',
    },
  },
  coordinates: { vertical_axis: 'z', handedness: 'right' },
  dimensions: {
    node_count: data.nodes.size,
    element_count: data.lines.length,
    ndf: dofOrder.length,
    dof_count: data.nodes.size * dofOrder.length,
  },
  model: {
    file: modelName,
    sha256: textFileHash(modelText),
    size: byteSize(modelText),
    node_order: nodeOrder,
    node_order_hash: nodeOrderHash(nodeOrder, dofOrder),
    ndf: dofOrder.length,
    dof_order: dofOrder,
  },
  modal_result: {
    file: resultName,
    sha256: textFileHash(resultText),
    size: byteSize(resultText),
    normalization,
    solver: {
      name: 'FEM-Struct-PyGo',
      backend: 'superlu',
      revision: '8e4303d34f12474cdc916754e7dc73383804ca42',
    },
  },
  provenance: {
    source_repository: 'Takayuki-Minagawa/Beam-TrussStructMaker',
    source_revision: 'b4415b77db41eccce5f39b4bb65d8807a89e47ed',
    source_hashes: {
      [modelName]: textFileHash(modelText),
      [resultName]: textFileHash(resultText),
    },
    golden_frequencies_hz: expectedFrequencies,
  },
};

await writeFile(
  resolve(sampleDir, manifestName),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

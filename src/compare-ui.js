import { AnimationController } from './animation.js';
import { compareModes } from './analysis.js';
import { loadFloorSource } from './loader.js';
import { computeFloorMetrics } from './geometry.js';
import { t } from './i18n.js';

export function setupComparison({ viewer, controller, data, on, requestRender, error }) {
  const $ = id => document.getElementById(id);
  let other = null, otherController = null, comparison = null, secondary = null, load = null, generation = 0, syncing = false, cameraFromOther = false, lastKey = '';
  const container = $('comparison-container');
  const clear = () => {
    generation++; load?.abort(); load = null;
    secondary?.dispose(); secondary = null; other = null; comparison = null; otherController = null;
    container.hidden = true; $('mac-table').replaceChildren(); $('compare-mode').replaceChildren(); $('compare-status').textContent = '';
    viewer.resize(); requestRender();
  };
  const table = () => {
    if (!comparison) return;
    const rows = comparison.rows.filter(row => row.modeA === controller.getCurrentMode());
    const element = document.createElement('table');
    const header = document.createElement('tr');
    for (const name of [t('compareMode'), 'Δ f [Hz]', 'MAC (uz)']) { const th = document.createElement('th'); th.textContent = name; header.appendChild(th); }
    element.appendChild(header);
    for (const row of rows) {
      const tr = document.createElement('tr');
      for (const value of [row.modeB, row.frequencyDifference.toFixed(4), row.mac === null ? t('undefinedMac') : row.mac.toFixed(4)]) {
        const td = document.createElement('td'); td.textContent = String(value); tr.appendChild(td);
      }
      element.appendChild(tr);
    }
    $('mac-table').replaceChildren(element);
  };
  on($('compare-files'), 'change', async event => {
    const files = Array.from(event.target.files); event.target.value = ''; if (!files.length) return;
    const id = ++generation; load?.abort(); load = new AbortController();
    $('compare-status').textContent = t('loadReading');
    try {
      const candidate = await loadFloorSource(files, { signal: load.signal });
      const result = compareModes(data, candidate);
      const { FloorViewer } = await import('./viewer.js');
      if (id !== generation) return;
      const wasHidden = container.hidden; container.hidden = false;
      let nextViewer;
      try { nextViewer = new FloorViewer(container); nextViewer.loadFloorData(candidate); }
      catch (e) { nextViewer?.dispose(); container.hidden = wasHidden; throw e; }
      secondary?.dispose(); secondary = nextViewer;
      other = candidate; comparison = result; otherController = new AnimationController(other);
      secondary.setViewState(viewer.getViewState()); viewer.resize(); secondary.resize();
      secondary.setRenderRequest(() => { if (!syncing) cameraFromOther = true; requestRender(); });
      $('compare-mode').replaceChildren(...otherController.getModeList().map(mode => new Option(`${mode} (${other.freqHz.get(mode).toFixed(2)} Hz)`, String(mode))));
      lastKey = ''; table(); requestRender();
    } catch (e) { if (id === generation && e.name !== 'AbortError') { error(e); $('compare-status').textContent = e.message; } }
  });
  on($('clear-compare'), 'click', clear);
  function update() {
    if (!secondary) return;
    syncing = true;
    if (cameraFromOther) { viewer.setViewState(secondary.getViewState()); cameraFromOther = false; }
    else secondary.setViewState(viewer.getViewState());
    secondary.setThemeColors(document.documentElement.dataset.theme === 'dark');
    const mode = Number($('compare-mode').value);
    if (otherController.getCurrentMode() !== mode) otherController.setMode(mode);
    const phase = 2 * Math.PI * controller.getFreqHz() * controller.getTime() + controller.getPhase();
    const sign = $('compare-sign').checked ? -1 : 1;
    const scale = controller.getScale() * computeFloorMetrics(data.nodes).aRef;
    secondary.updateDeformed(id => other.nodes.get(id).z + sign * scale * otherController.getNormalizedUz(id) * Math.sin(phase));
    secondary.setVisibility({ labels: $('chk-node-ids').checked && !controller.isPlaying(), axes: $('chk-axes').checked, grid: $('chk-grid').checked, undeformed: $('chk-undeformed').checked, deformed: $('chk-deformed').checked });
    const key = `${controller.getCurrentMode()}:${mode}:${sign}:${document.documentElement.lang}`;
    if (key !== lastKey) { table(); lastKey = key; }
    const row = comparison.rows.find(row => row.modeA === controller.getCurrentMode() && row.modeB === mode);
    let maxDiff = 0;
    for (const id of comparison.nodeIds) maxDiff = Math.max(maxDiff, Math.abs(controller.getNormalizedUz(id) - sign * otherController.getNormalizedUz(id)));
    $('compare-status').textContent = `Δ f = ${row.frequencyDifference.toFixed(4)} Hz; MAC(uz) = ${row.mac === null ? t('undefinedMac') : row.mac.toFixed(4)}; max |Δuz/Umax| = ${maxDiff.toFixed(4)}`;
    $('comparison-caption').textContent = `${other.meta?.title || t('compare')} · ${t('labelMode')} ${mode} · ${other.freqHz.get(mode).toFixed(2)} Hz · ${t('samePhase')}`;
    const damping = secondary.render();
    syncing = false;
    if (damping) { cameraFromOther = true; requestRender(); }
  }
  return { update, dispose: clear, resize() { secondary?.resize(); } };
}

/** Like-for-like physical archive comparison, sharing the main time and camera. */
import { AnimationController } from './animation.js';
import { compareResponses } from './analysis.js';
import { loadFloorSource } from './loader.js';
import { drawComparisonHistory } from './history-chart.js';
import { downloadBlob } from './downloads.js';
import { getLang, t } from './i18n.js';

export function setupResponseComparison({ viewer, controller, data, on, requestRender, error, getSelectedNode, seek, beforeCapture }) {
  const $ = id => document.getElementById(id);
  const container = $('comparison-container');
  let other = null, otherController = null, comparison = null, secondary = null;
  let load = null, generation = 0, syncing = false, cameraFromOther = false;
  let chart = null, chartKey = '';
  $('response-compare-section').hidden = false;
  $('response-compare-csv').disabled = true;
  $('response-compare-png').disabled = true;

  const clear = () => {
    generation++; load?.abort(); load = null;
    secondary?.dispose(); secondary = null;
    other = null; otherController = null; comparison = null; chart = null; chartKey = '';
    container.hidden = true;
    $('response-compare-status').textContent = '';
    $('response-compare-chart').replaceChildren();
    $('response-compare-csv').disabled = true;
    $('response-compare-png').disabled = true;
    viewer.resize(); requestRender();
  };

  on($('response-compare-files'), 'change', async event => {
    const files = Array.from(event.target.files); event.target.value = '';
    if (!files.length) return;
    const id = ++generation;
    load?.abort(); load = new AbortController();
    $('response-compare-status').textContent = t('loadReading');
    requestRender();
    try {
      const candidate = await loadFloorSource(files, { signal: load.signal });
      const result = compareResponses(data, candidate);
      const { FloorViewer } = await import('./viewer.js');
      if (id !== generation) return;
      const wasHidden = container.hidden;
      container.hidden = false;
      let nextViewer;
      try { nextViewer = new FloorViewer(container); nextViewer.loadFloorData(candidate); }
      catch (failure) { nextViewer?.dispose(); container.hidden = wasHidden; throw failure; }
      secondary?.dispose();
      secondary = nextViewer; other = candidate; comparison = result;
      otherController = new AnimationController(other);
      secondary.setViewState(viewer.getViewState());
      viewer.resize(); secondary.resize();
      secondary.setRenderRequest(() => { if (!syncing) cameraFromOther = true; requestRender(); });
      $('response-compare-csv').disabled = false;
      $('response-compare-png').disabled = false;
      chartKey = '';
      update(); requestRender();
    } catch (failure) {
      if (id === generation && failure.name !== 'AbortError') {
        error(failure); $('response-compare-status').textContent = failure.message;
      }
    } finally { if (id === generation) { load = null; requestRender(); } }
  });

  on($('clear-response-compare'), 'click', clear);
  on($('response-compare-chart'), 'click', event => {
    if (!comparison) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * 600 - 64) / 516));
    const times = comparison.times;
    seek(times[0] * (1 - ratio) + times.at(-1) * ratio);
  });
  on($('response-compare-csv'), 'click', () => {
    if (!comparison) return;
    const nodeId = getSelectedNode();
    const rows = comparison.history(nodeId);
    const metadata = JSON.stringify({ case_A: comparison.caseA, case_B: comparison.caseB,
      difference: 'B-A', quantity: comparison.quantity, unit: comparison.unit, node_id: nodeId,
      interpolated: false });
    downloadBlob(`# ${metadata}\ntime_s,node_id,value_A,value_B,difference_B_minus_A\n${rows.map(row =>
      `${row.time},${nodeId},${row.valueA},${row.valueB},${row.delta}`).join('\n')}`,
    `response-difference-node${nodeId}.csv`, 'text/csv');
  });
  on($('response-compare-png'), 'click', async () => {
    if (!secondary || controller.isPlaying()) { error(new Error(t('alertPngStop'))); return; }
    try {
      beforeCapture();
      const width = Number($('capture-size').value) || 1600;
      await secondary.savePNG('response-difference.png', { width, height: Math.round(width * .625),
        background: $('capture-background').value || undefined });
    } catch (failure) { error(failure); }
  });

  function update() {
    if (!secondary) return;
    syncing = true;
    if (cameraFromOther) { viewer.setViewState(secondary.getViewState()); cameraFromOther = false; }
    else secondary.setViewState(viewer.getViewState());
    secondary.setThemeColors(document.documentElement.dataset.theme === 'dark');
    otherController.setTime(controller.getTime());
    secondary.updateDeformed(id => other.nodes.get(id).z,
      id => otherController.getResponseValue(id) - controller.getResponseValue(id), comparison.range);
    secondary.setVisibility({ labels: $('chk-node-ids').checked && !controller.isPlaying(),
      axes: $('chk-axes').checked, grid: $('chk-grid').checked,
      undeformed: $('chk-undeformed').checked, deformed: $('chk-deformed').checked });
    const selected = getSelectedNode();
    const current = otherController.getResponseValue(selected) - controller.getResponseValue(selected);
    $('response-compare-status').textContent = t('responseCompareStatus', {
      value: comparison.maxAbs.toPrecision(5), unit: comparison.unit,
      node: comparison.maxNodeId, time: comparison.maxTime.toPrecision(5),
      selected, current: current.toPrecision(5),
    });
    $('comparison-caption').textContent = `B−A: ${comparison.caseB} − ${comparison.caseA} [${comparison.unit}]`;
    const key = `${selected}:${getLang()}`;
    if (key !== chartKey) {
      chart = drawComparisonHistory($('response-compare-chart'), comparison.history(selected),
        comparison.unit, t('responseCompareHistory', { id: selected }), ['A', 'B', 'B−A']);
      $('response-compare-chart').setAttribute('aria-label', t('responseCompareHistory', { id: selected }));
      chartKey = key;
    }
    chart.setTime(controller.getTime());
    secondary.setFrameMetadata({ title: `B−A: ${comparison.caseB} − ${comparison.caseA}`,
      lines: [`${comparison.quantity} [${comparison.unit}]`, `t=${controller.getTime().toFixed(6)} s`,
        `node ${selected}: ${current.toPrecision(6)} ${comparison.unit}`, 'Geometry: undeformed floor'],
      legend: { ...comparison.range, unit: comparison.unit, label: 'B−A' } });
    const damping = secondary.render();
    syncing = false;
    if (damping) { cameraFromOther = true; requestRender(); }
  }

  return { update, isLoading: () => !!load, resize: () => secondary?.resize(), dispose: clear };
}

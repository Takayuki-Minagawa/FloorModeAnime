/** Analysis panels: history, peaks, view settings and annotated capture. */
import { t, getLang } from './i18n.js';
import { computeResponsePeaks, getNodeHistory } from './analysis.js';
import { playbackAction } from './playback.js';
import { drawHistory } from './history-chart.js';
import { downloadBlob, readTextFiles } from './downloads.js';
import { buildSettings, validateSettings, SETTING_IDS } from './settings.js';
import { setupComparison } from './compare-ui.js';
import { responseGradient } from './capture.js';

export function setupAnalysisTools({ viewer, controller, data, requestRender, beforeCapture }) {
  const $ = id => document.getElementById(id);
  const events = new AbortController();
  const on = (target, event, fn) => target.addEventListener(event, fn, { signal: events.signal });
  const response = controller.getDataKind() === 'response';
  let selected = controller.getNodeIds()[0], history = null, chart = null, chartKey = '', envelope = false;
  let recording = null, disposed = false, lastMetadata = '', peaks = response ? (data.peaks || computeResponsePeaks(data)) : null;
  const error = e => { $('tools-error').textContent = e.message || String(e); };
  $('tools-error').textContent = ''; $('video-status').textContent = '';
  $('history-controls').hidden = !response;
  $('compare-section').hidden = response;
  $('observation-controls').hidden = response;
  $('observation-period').value = '0';
  $('show-envelope').checked = false;
  $('selected-node').value = String(selected);
  // Numeric entry works for all IDs; cap datalist DOM size for large models.
  $('node-options').replaceChildren(...controller.getNodeIds().slice(0, 500).map(id => new Option(String(id), String(id))));
  viewer.setSelectedNode(selected);
  const comparison = setupComparison({ viewer, controller, data, on, requestRender, error });
  const select = id => {
    if (recording) return;
    if (!data.nodes.has(id)) { error(new Error(`E_NODE_SELECT: ${t('invalidNode')}`)); return; }
    $('tools-error').textContent = ''; selected = id; $('selected-node').value = String(id);
    viewer.setSelectedNode(id); chartKey = ''; requestRender();
  };
  const seek = time => { if (recording) return; playbackAction(controller, 'seek', time); requestRender(); };
  on($('selected-node'), 'change', () => select(Number($('selected-node').value)));
  viewer.onNodeSelect(select);
  on($('observation-period'), 'change', () => controller.setObservationPeriod(Number($('observation-period').value) || null));
  on($('jump-peak'), 'click', () => { const peak = peaks.nodes.find(item => item.nodeId === selected); seek(peak.timeOfMaxAbs); });
  on($('jump-global'), 'click', () => { select(peaks.global.nodeId); seek(peaks.global.time); });
  on($('history-chart'), 'click', event => {
    if (!chart) return;
    const rect = $('history-chart').getBoundingClientRect();
    seek(chart.timeAt((event.clientX - rect.left) / rect.width));
  });
  on($('history-chart'), 'keydown', event => {
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); seek(event.key === 'Home' ? data.response.times[0] : data.response.times.at(-1)); }
  });
  on($('history-csv'), 'click', () => {
    const rows = getNodeHistory(data, selected);
    const comment = JSON.stringify({ case_id: data.response.caseId, node_id: selected, quantity: data.response.quantity, unit: data.response.unit, interpolated: false });
    downloadBlob(`# ${comment}\ntime_s,node_id,value\n${rows.map(p => `${p.time},${selected},${p.value}`).join('\n')}`, `history_node${selected}.csv`, 'text/csv');
  });
  on($('show-envelope'), 'change', () => {
    if (!response) { $('show-envelope').checked = false; return; }
    envelope = $('show-envelope').checked;
    controller.stop();
    viewer.setEnvelope(envelope ? new Map(peaks.nodes.map(p => [p.nodeId, p.maxAbs])) : null, { min: 0, max: peaks.global.maxAbs });
    beforeCapture(); requestRender();
  });
  on($('save-settings'), 'click', () => {
    const controls = Object.fromEntries(SETTING_IDS.map(id => { const el = $(id); return [id, el.type === 'checkbox' ? el.checked : el.value]; }));
    const state = buildSettings(data, controller, viewer, selected, controls);
    downloadBlob(JSON.stringify(state, null, 2), 'floor-view-settings.json', 'application/json');
  });
  on($('settings-file'), 'change', async event => {
    const files = Array.from(event.target.files); event.target.value = ''; if (!files.length) return;
    try {
      const [file] = await readTextFiles(files, events.signal);
      const state = validateSettings(JSON.parse(file.text), data);
      controller.stop();
      if (!response) { $('mode-select').value = String(state.mode); $('mode-select').dispatchEvent(new Event('change', { bubbles: true })); }
      for (const [id, value] of Object.entries(state.controls)) {
        const el = $(id); if (el.type === 'checkbox') el.checked = value; else el.value = value;
        el.dispatchEvent(new Event(el.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
      }
      for (const [prefix, value] of [['scale', state.scale], ['speed', state.speed]]) {
        $(`${prefix}-slider`).value = String(value); $(`${prefix}-slider`).dispatchEvent(new Event('input', { bubbles: true }));
      }
      controller.setObservationPeriod(state.observationPeriod); $('observation-period').value = String(state.observationPeriod || 0);
      controller.setTime(state.time); viewer.setViewState(state.view); select(state.selectedNode);
      beforeCapture(); requestRender();
    } catch (e) { if (e.name !== 'AbortError') error(e); }
  });
  on($('save-video'), 'click', async () => {
    if (recording) return;
    if (controller.isPlaying()) { error(new Error(t('alertPngStop'))); return; }
    const duration = Number($('video-duration').value);
    if (!Number.isFinite(duration) || duration < 1 || duration > 30) { error(new Error(t('invalidDuration'))); return; }
    recording = new AbortController(); document.body.dataset.recording = 'true';
    $('comparison-container').style.pointerEvents = 'none';
    const time = controller.getTime();
    const disabled = new Map([...document.querySelectorAll('#controls button, #controls input, #controls select')].map(el => [el, el.disabled]));
    for (const el of disabled.keys()) el.disabled = true;
    $('cancel-video').hidden = false; $('cancel-video').disabled = false;
    $('video-status').textContent = t('recording');
    try {
      beforeCapture();
      const width = Number($('capture-size').value);
      await viewer.recordVideo({ duration, fps: 30, width, height: Math.round(width * .625), background: $('capture-background').value || undefined, signal: recording.signal, filename: 'floor-animation',
        onFrame: seconds => {
          const rate = controller.getObservationPeriod() ? 1 / (controller.getFreqHz() * controller.getObservationPeriod()) : controller.getSpeed();
          controller.setTime(time + seconds * rate); beforeCapture();
        },
        onProgress: fraction => { $('video-status').textContent = `${t('recording')} ${Math.round(fraction * 100)}%`; },
      });
      if (!disposed) $('video-status').textContent = t('saved');
    } catch (e) { if (!disposed) { if (e.name === 'AbortError') $('video-status').textContent = t('loadCancelled'); else { error(e); $('video-status').textContent = t('videoUnavailable'); } } }
    finally {
      recording = null; document.body.dataset.recording = 'false';
      $('comparison-container').style.pointerEvents = '';
      if (!disposed) { controller.setTime(time); controller.stop(); for (const [el, value] of disabled) el.disabled = value; $('cancel-video').hidden = true; beforeCapture(); requestRender(); }
    }
  });
  on($('cancel-video'), 'click', () => recording?.abort());
  function update() {
    if (disposed) return;
    const lang = getLang();
    const value = response ? controller.getResponseValue(selected) : controller.getNormalizedUz(selected);
    $('selected-value').textContent = `${t('nodeId')} ${selected}: ${value.toPrecision(6)} ${response ? controller.getResponseUnit() : t('normalizedValue')}`;
    const observation = controller.getObservationPeriod();
    $('observation-status').textContent = observation ? t('observationActive', { seconds: observation }) : '';
    $('speed-slider').disabled = !!observation; $('speed-number').disabled = !!observation;
    if (recording) { $('speed-slider').disabled = true; $('speed-number').disabled = true; }
    if (response) {
      const key = `${selected}:${lang}`;
      if (key !== chartKey) {
        history = getNodeHistory(data, selected);
        chart = drawHistory($('history-chart'), history, controller.getResponseUnit(), t('historyTitle', { id: selected }));
        $('history-chart').setAttribute('aria-label', t('historyTitle', { id: selected }));
        chartKey = key;
        const peak = peaks.nodes.find(p => p.nodeId === selected);
        $('peak-values').textContent = `${t('peakMinimum')}: ${peak.min.toPrecision(5)} @ ${peak.timeOfMin.toPrecision(5)} s; ${t('peakMaximum')}: ${peak.max.toPrecision(5)} @ ${peak.timeOfMax.toPrecision(5)} s; |max|: ${peak.maxAbs.toPrecision(5)} ${controller.getResponseUnit()} @ ${peak.timeOfMaxAbs.toPrecision(5)} s`;
      }
      chart.setTime(controller.getTime());
      const range = envelope ? { min: 0, max: peaks.global.maxAbs } : controller.getResponseRange();
      const gradient = document.querySelector('.response-gradient');
      const colorKey = `${range.min}:${range.max}`;
      if (gradient.dataset.range !== colorKey) { gradient.style.background = responseGradient(range.min, range.max); gradient.dataset.range = colorKey; }
      if (envelope) {
        $('display-meaning').textContent = t('envelopeMeaning');
        $('response-legend-title').textContent = `${t('envelope')} [${controller.getResponseUnit()}]`;
        $('response-legend-min').textContent = '0'; $('response-legend-max').textContent = peaks.global.maxAbs.toPrecision(4);
      } else {
        $('display-meaning').textContent = t(controller.isDisplayNormalized() ? 'displayMeaningResponseNormalized' : 'displayMeaningResponsePhysical');
      }
    }
    const lines = [
      response ? `${controller.getResponseQuantity()} [${controller.getResponseUnit()}]` : `${t('labelMode')} ${controller.getCurrentMode()} · f = ${controller.getFreqHz().toFixed(4)} Hz`,
      `t = ${controller.getTime().toFixed(6)} s · ${t('labelScale')} ${controller.getScale().toFixed(1)}`,
      $('display-meaning').textContent,
      $('selected-value').textContent,
      ...(observation ? [$('observation-status').textContent] : []),
      `ID: ${data.identity || data.meta?.title || ''}`,
    ];
    const metadata = { title: data.meta?.title || data.response?.caseId || 'Floor Mode Anime', lines, playing: controller.isPlaying(), legend: response ? { ...(envelope ? { min: 0, max: peaks.global.maxAbs } : controller.getResponseRange()), unit: controller.getResponseUnit(), label: envelope ? t('envelope') : controller.getResponseQuantity() } : undefined };
    const encoded = JSON.stringify(metadata);
    if (encoded !== lastMetadata) { viewer.setFrameMetadata(metadata); lastMetadata = encoded; }
    if (!recording) comparison.update();
  }
  update();
  return { update, resize: () => { chartKey = ''; comparison.resize(); }, isRecording: () => !!recording, cancelRecording: () => recording?.abort(), dispose() { disposed = true; recording?.abort(); events.abort(); viewer.onNodeSelect(null); comparison.dispose(); } };
}

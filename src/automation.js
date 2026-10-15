/**
 * automation.js -- 自動操作・再現用の入口
 *
 * - URL クエリ（?sample=…&mode=…&t=…&view=…&node=…）の初期状態適用
 * - window.floorModeAnime 公開 API（既存の UI 配線を経由して状態を変える）
 * - 状態スナップショット（body の data-* 属性と同じ内容を JSON で返す）
 *
 * いずれも UI の DOM イベントを通して操作するため、表示の同期は ui.js に委ねる。
 *
 * @module automation
 */

import { CAMERA_PRESETS } from './constants.js';
import { playbackAction } from './playback.js';
import { syncPlaybackDisplays } from './ui.js';

export const SAMPLE_SETS = {
  Test0202: ['Test0202_calc.yaml', 'Test0202_calc_go_modal_result.json', 'Test0202_manifest.json'],
  response_case: ['response_case.json'],
  sample_case: ['sample_case.json'],
};

const $ = (id) => document.getElementById(id);
const dispatch = (el, type) => el?.dispatchEvent(new Event(type, { bubbles: true }));

/**
 * URL クエリから読込前に決める設定（言語・テーマ・サンプル・外部 URL）を返す。
 * @param {URLSearchParams} params
 * @returns {{ lang: string|null, theme: string|null, sample: string|null, sources: string[] }}
 */
export function parseStartupParams(params) {
  const lang = ['ja', 'en'].includes(params.get('lang')) ? params.get('lang') : null;
  const theme = ['light', 'dark'].includes(params.get('theme')) ? params.get('theme') : null;
  const sample = Object.hasOwn(SAMPLE_SETS, params.get('sample') ?? '') ? params.get('sample') : null;
  const sources = (params.get('src') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return { lang, theme, sample, sources };
}

/**
 * 読込完了後に URL クエリの表示状態（mode, t, view, node, scale, speed, obs）を適用する。
 * 不正な値は無視し、例外を投げない。
 * @param {{ getState: () => { controller: object|null } }} app
 * @param {URLSearchParams} params
 */
export function applyUrlState(app, params) {
  const { controller } = app.getState();
  if (!controller) return;
  const isResponse = controller.getDataKind() === 'response';

  const mode = params.get('mode');
  if (mode !== null && !isResponse) {
    const select = $('mode-select');
    if (select && [...select.options].some((option) => option.value === mode)) {
      select.value = mode;
      dispatch(select, 'change');
    }
  }
  for (const [key, id] of [['speed', 'speed-slider'], ['scale', 'scale-slider']]) {
    const value = params.get(key);
    const slider = $(id);
    if (value !== null && slider && !slider.disabled && Number.isFinite(Number(value))) {
      slider.value = value;
      dispatch(slider, 'input');
    }
  }
  const obs = params.get('obs');
  if (obs !== null && !isResponse && ['0', '2', '4'].includes(obs)) {
    const select = $('observation-period');
    if (select) { select.value = obs; dispatch(select, 'change'); }
  }
  const time = params.get('t');
  if (time !== null && Number.isFinite(Number(time))) {
    playbackAction(controller, 'seek', Number(time));
    syncPlaybackDisplays(controller);
  }
  const view = params.get('view');
  if (view !== null && Object.hasOwn(CAMERA_PRESETS, view)) $(`btn-view-${view}`)?.click();
  const node = params.get('node');
  if (node !== null && Number.isFinite(Number(node))) {
    const input = $('selected-node');
    if (input) { input.value = node; dispatch(input, 'change'); }
  }
}

/**
 * 現在の状態を JSON 化して返す。UI の表示と同じソース（controller / DOM）から読む。
 * @param {{ getState: () => { data: object|null, controller: object|null, loading: boolean } }} app
 * @returns {object}
 */
export function snapshotState(app) {
  const { data, controller, loading } = app.getState();
  const body = document.body.dataset;
  const base = {
    ready: body.ready === 'true',
    loadState: body.loadState ?? null,
    loading: Boolean(loading),
    lang: document.documentElement.lang || null,
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    errors: [...document.querySelectorAll('#error-container .msg-error')].map((el) => el.firstChild?.textContent ?? el.textContent),
    warnings: [...document.querySelectorAll('#error-container .msg-warning')].map((el) => el.firstChild?.textContent ?? el.textContent),
    toolsMessage: $('tools-error')?.textContent ?? '',
  };
  if (!controller || !data) return { ...base, dataKind: null };
  const isResponse = controller.getDataKind() === 'response';
  return {
    ...base,
    dataKind: controller.getDataKind(),
    title: data.meta?.title ?? data.response?.caseId ?? null,
    identity: data.identity ?? null,
    nodeCount: data.nodes?.size ?? 0,
    mode: isResponse ? null : controller.getCurrentMode(),
    modes: controller.getModeList(),
    freqHz: isResponse ? null : controller.getFreqHz(),
    period: isResponse ? null : controller.getPeriod(),
    time: controller.getTime(),
    timeline: controller.getTimelineRange(),
    playing: controller.isPlaying(),
    scale: controller.getScale(),
    speed: controller.getSpeed(),
    observationPeriod: controller.getObservationPeriod(),
    selectedNode: Number(body.selectedNode) || null,
    maxNode: controller.getMaxNode(),
    responseQuantity: controller.getResponseQuantity(),
    responseUnit: controller.getResponseUnit(),
  };
}

/**
 * window.floorModeAnime として公開する API を組み立てる。
 * 状態変更はすべて既存の UI 要素へのイベント経由で行い、表示との不整合を避ける。
 * @param {object} app  createApplication の戻り値
 * @param {string} version
 */
export function createPublicApi(app, version) {
  return Object.freeze({
    version,
    samples: Object.keys(SAMPLE_SETS),
    load: (source, name) => app.load(source, name),
    loadSample: (key) => app.loadSample(key),
    cancelLoad: () => app.cancelLoad(),
    getState: () => snapshotState(app),
    setMode(mode) {
      const select = $('mode-select');
      if (!select) return false;
      const value = String(mode);
      if (![...select.options].some((option) => option.value === value)) return false;
      select.value = value; dispatch(select, 'change'); app.requestRender(); return true;
    },
    setTime(time) {
      const { controller } = app.getState();
      if (!controller || !Number.isFinite(Number(time))) return false;
      playbackAction(controller, 'seek', Number(time));
      syncPlaybackDisplays(controller); app.requestRender(); return true;
    },
    step(direction = 1) {
      $(direction < 0 ? 'btn-step-back' : 'btn-step-fwd')?.click(); return true;
    },
    play() { $('btn-play')?.click(); return true; },
    stop() { $('btn-stop')?.click(); return true; },
    selectNode(id) {
      const input = $('selected-node');
      if (!input) return false;
      input.value = String(id); dispatch(input, 'change'); app.requestRender();
      return document.body.dataset.selectedNode === String(id);
    },
    setView(preset) {
      if (!Object.hasOwn(CAMERA_PRESETS, preset)) return false;
      $(`btn-view-${preset}`)?.click(); return true;
    },
    setObservationPeriod(seconds) {
      const select = $('observation-period');
      const value = String(seconds ?? 0);
      if (!select || ![...select.options].some((option) => option.value === value)) return false;
      select.value = value; dispatch(select, 'change'); return true;
    },
    setScale(value) { const el = $('scale-number'); if (!el) return false; el.value = String(value); dispatch(el, 'change'); return true; },
    setSpeed(value) { const el = $('speed-number'); if (!el) return false; el.value = String(value); dispatch(el, 'change'); return true; },
  });
}

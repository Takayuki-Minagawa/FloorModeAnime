/** Data-independent controls stay usable after a failed first load. */
import { getLang, setLang, t, applyTranslations } from './i18n.js';
import { STORAGE_KEYS } from './constants.js';

export function setupShell({ load, cancel, onChange, loadSample = null }) {
  const events = new AbortController();
  const on = (target, event, fn) => target.addEventListener(event, fn, { signal: events.signal });
  const input = document.getElementById('file-input');
  const files = list => {
    const selected = Array.from(list || []);
    if (!selected.length) return;
    load(selected, selected.map(file => file.name).join(', '));
  };
  on(document.getElementById('btn-select-file'), 'click', () => input.click());
  on(input, 'change', () => { files(input.files); input.value = ''; });
  const overlay = document.getElementById('drop-overlay');
  on(window, 'dragover', event => { event.preventDefault(); overlay.classList.add('active'); });
  on(window, 'dragleave', event => { if (!event.relatedTarget) overlay.classList.remove('active'); });
  on(window, 'drop', event => { event.preventDefault(); overlay.classList.remove('active'); files(event.dataTransfer?.files); });
  on(document.getElementById('cancel-load'), 'click', cancel);
  // サンプル選択と貼り付け読込（ファイルダイアログを使わない入力経路）
  const sampleSelect = document.getElementById('sample-select');
  const sampleButton = document.getElementById('btn-load-sample');
  if (sampleSelect && sampleButton && loadSample) {
    on(sampleButton, 'click', () => loadSample(sampleSelect.value));
  }
  const pasteInput = document.getElementById('paste-input');
  const pasteButton = document.getElementById('btn-load-paste');
  if (pasteInput && pasteButton) {
    on(pasteButton, 'click', () => {
      const text = pasteInput.value.trim();
      const status = document.getElementById('tools-error');
      if (!text) { if (status) status.textContent = t('pasteEmpty'); return; }
      if (status) status.textContent = '';
      load([{ name: 'pasted.json', text }], 'pasted.json');
    });
  }
  // Once data is ready ui.js owns these two controls.
  on(document.getElementById('btn-lang'), 'click', () => {
    if (document.body.dataset.ready === 'true') return;
    setLang(getLang() === 'ja' ? 'en' : 'ja'); applyTranslations(); onChange();
  });
  on(document.getElementById('btn-theme'), 'click', () => {
    if (document.body.dataset.ready === 'true') return;
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : '';
    try { localStorage.setItem(STORAGE_KEYS.theme, dark ? 'dark' : 'light'); } catch { /* unavailable */ }
    const button = document.getElementById('btn-theme');
    button.textContent = t(dark ? 'btnThemeToLight' : 'btnThemeToDark');
    button.setAttribute('aria-pressed', String(dark));
    onChange();
  });
  return () => events.abort();
}

/** Data-independent controls stay usable after a failed first load. */
import { getLang, setLang, t, applyTranslations } from './i18n.js';
import { STORAGE_KEYS } from './constants.js';

export function setupShell({ load, cancel, onChange }) {
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
    document.getElementById('btn-theme').textContent = t(dark ? 'btnThemeDark' : 'btnThemeLight');
    onChange();
  });
  return () => events.abort();
}

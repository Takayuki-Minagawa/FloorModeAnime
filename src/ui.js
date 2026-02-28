/**
 * ui.js -- UIコントロール・イベント管理
 *
 * @module ui
 */

/**
 * UI 要素のイベントリスナーを設定する。
 *
 * @param {object}              params
 * @param {import('./viewer.js').FloorViewer}         params.viewer
 * @param {import('./animation.js').AnimationController} params.animController
 * @param {object}              params.floorData        parseFloorData の戻り値
 * @param {(jsonString:string)=>void} params.onFileLoad  ファイル読込コールバック
 */
export function setupUI({ viewer, animController, floorData, onFileLoad }) {
  // ---------- モード選択 ----------
  const modeSelect = document.getElementById('mode-select');
  // 既存の option をクリア
  modeSelect.innerHTML = '';

  // animController から利用可能なモード番号一覧を取得
  const modeList = animController.getModeList();
  for (const modeNum of modeList) {
    const opt = document.createElement('option');
    opt.value = String(modeNum);
    opt.textContent = `Mode ${modeNum}`;
    modeSelect.appendChild(opt);
  }

  // 先頭モードを選択状態にしておく
  if (modeList.length > 0) {
    modeSelect.value = String(modeList[0]);
  }

  // change イベント — 新しいリスナーだけ残す
  const onModeChange = () => {
    const n = Number(modeSelect.value);
    animController.setMode(n);
    updateTimeDisplay(animController.getTime());
  };
  replaceListener(modeSelect, 'change', onModeChange, '_onModeChange');

  // ---------- 再生 / 停止ボタン ----------
  const btnPlay = document.getElementById('btn-play');
  const btnStop = document.getElementById('btn-stop');

  const onPlay = () => { animController.play(); };
  const onStop = () => { animController.stop(); };
  replaceListener(btnPlay, 'click', onPlay, '_onPlay');
  replaceListener(btnStop, 'click', onStop, '_onStop');

  // ---------- 倍率スライダー ----------
  const scaleSlider = document.getElementById('scale-slider');
  const scaleValue  = document.getElementById('scale-value');

  // 初期値をリセット
  scaleSlider.value = '1.0';
  scaleValue.textContent = '1.0';
  animController.setScale(1.0);

  const onScaleInput = () => {
    const s = parseFloat(scaleSlider.value);
    animController.setScale(s);
    scaleValue.textContent = s.toFixed(1);
  };
  replaceListener(scaleSlider, 'input', onScaleInput, '_onScaleInput');

  // ---------- 表示切替チェックボックス ----------
  const chkUndeformed = document.getElementById('chk-undeformed');
  const chkDeformed   = document.getElementById('chk-deformed');
  const chkAxes       = document.getElementById('chk-axes');
  const chkGrid       = document.getElementById('chk-grid');

  // 初期状態を全て checked に戻す
  chkUndeformed.checked = true;
  chkDeformed.checked   = true;
  chkAxes.checked       = true;
  chkGrid.checked       = true;

  const applyVisibility = () => {
    viewer.setVisibility({
      undeformed: chkUndeformed.checked,
      deformed:   chkDeformed.checked,
      axes:       chkAxes.checked,
      grid:       chkGrid.checked,
    });
  };

  // 初回適用
  applyVisibility();

  const onVisChange = () => { applyVisibility(); };
  replaceListener(chkUndeformed, 'change', onVisChange, '_onVis');
  replaceListener(chkDeformed,   'change', onVisChange, '_onVis');
  replaceListener(chkAxes,       'change', onVisChange, '_onVis');
  replaceListener(chkGrid,       'change', onVisChange, '_onVis');

  // ---------- PNG 保存ボタン ----------
  const btnDownload = document.getElementById('btn-download');

  const onDownload = async () => {
    if (animController.isPlaying()) {
      alert('PNG保存はアニメーション停止中のみ実行できます。\nPlease stop the animation first.');
      return;
    }

    const filename = buildPngFilename(floorData, animController);
    try {
      await viewer.savePNG(filename);
    } catch (err) {
      console.error('PNG save failed:', err);
      alert(`PNG save failed: ${err.message}`);
    }
  };
  replaceListener(btnDownload, 'click', onDownload, '_onDownload');

  // ---------- ファイル読込 ----------
  const fileInput = document.getElementById('file-input');

  const onFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      onFileLoad(reader.result);
    };
    reader.onerror = () => {
      alert(`File read error: ${reader.error.message}`);
    };
    reader.readAsText(file);

    // 同じファイルを再選択できるようにリセット
    fileInput.value = '';
  };
  replaceListener(fileInput, 'change', onFileChange, '_onFileChange');

  // ---------- 時間表示を初期状態に ----------
  updateTimeDisplay(animController.getTime());
}

/**
 * 時間表示を更新する。
 *
 * @param {number} t  現在時刻 [s]
 */
export function updateTimeDisplay(t) {
  const el = document.getElementById('time-display');
  if (el) {
    el.textContent = `t = ${t.toFixed(3)} s`;
  }
}

// ─── ヘルパー ───────────────────────────────────────────────────────────────

/**
 * 要素のイベントリスナーを安全に差し替える。
 * setupUI が複数回呼ばれてもリスナーが多重登録されない。
 *
 * @param {HTMLElement} el
 * @param {string}      event
 * @param {Function}    handler
 * @param {string}      slotKey  要素に保存するプロパティ名
 */
function replaceListener(el, event, handler, slotKey) {
  if (el[slotKey]) {
    el.removeEventListener(event, el[slotKey]);
  }
  el[slotKey] = handler;
  el.addEventListener(event, handler);
}

/**
 * PNG 保存ファイル名を組み立てる。
 *
 * 形式: floormode_<title>_mode<mode>_t<sec3>_x<scale>.png
 *
 * @param {object} floorData
 * @param {import('./animation.js').AnimationController} animController
 * @returns {string}
 */
function buildPngFilename(floorData, animController) {
  // title: ケバブケース変換（スペース→ハイフン, 小文字）
  const rawTitle = (floorData.meta && floorData.meta.title) || 'untitled';
  const title = rawTitle
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');

  // 現在のモード番号 — getModeList の先頭をフォールバックに使う
  const modeList = animController.getModeList();
  let currentMode = modeList.length > 0 ? modeList[0] : 1;
  const modeSelect = document.getElementById('mode-select');
  if (modeSelect && modeSelect.value) {
    currentMode = Number(modeSelect.value);
  }

  // 時刻
  const sec3 = animController.getTime().toFixed(3);

  // スケール
  const scaleSlider = document.getElementById('scale-slider');
  const scale = scaleSlider ? parseFloat(scaleSlider.value).toFixed(1) : '1.0';

  return `floormode_${title}_mode${currentMode}_t${sec3}_x${scale}.png`;
}

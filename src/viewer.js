/**
 * viewer.js — three.js シーン・描画・PNG出力
 *
 * LineSegments2 + LineMaterial で太線を描画。
 * 色・線幅の既定値はテーマ別に constants.js の THEME / LINE_WIDTH で定義する。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { THEME, LINE_WIDTH, VIEW } from './constants.js';
import { computeFloorMetrics, toThree, setThreePosition } from './geometry.js';

export class FloorViewer {
  /**
   * @param {HTMLElement} canvasContainer - three.js の canvas を配置する DOM 要素
   */
  constructor(canvasContainer) {
    this._container = canvasContainer;

    // レンダラー
    this._renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setClearColor(THEME.light.clear, 1);
    this._renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    canvasContainer.appendChild(this._renderer.domElement);

    // CSS2D レンダラー（ノードラベル用オーバーレイ）
    this._css2dRenderer = new CSS2DRenderer();
    this._css2dRenderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    this._css2dRenderer.domElement.style.position = 'absolute';
    this._css2dRenderer.domElement.style.top = '0';
    this._css2dRenderer.domElement.style.left = '0';
    this._css2dRenderer.domElement.style.pointerEvents = 'none';
    canvasContainer.appendChild(this._css2dRenderer.domElement);

    // シーン
    this._scene = new THREE.Scene();

    // カメラ (PerspectiveCamera)
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight || 1;
    this._camera = new THREE.PerspectiveCamera(
      VIEW.CAMERA_FOV, aspect, VIEW.CAMERA_NEAR, VIEW.CAMERA_FAR,
    );
    this._camera.position.set(10, 10, 10);
    this._camera.lookAt(0, 0, 0);

    // OrbitControls
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.enableDamping = true;
    this._controls.dampingFactor = 0.1;

    // グループ管理（表示ON/OFF用）
    this._undeformedGroup = new THREE.Group();
    this._undeformedGroup.name = 'undeformed';
    this._deformedGroup = new THREE.Group();
    this._deformedGroup.name = 'deformed';
    this._axesGroup = new THREE.Group();
    this._axesGroup.name = 'axes';
    this._gridGroup = new THREE.Group();
    this._gridGroup.name = 'grid';
    this._labelsGroup = new THREE.Group();
    this._labelsGroup.name = 'labels';

    this._scene.add(this._undeformedGroup);
    this._scene.add(this._deformedGroup);
    this._scene.add(this._axesGroup);
    this._scene.add(this._gridGroup);
    this._scene.add(this._labelsGroup);

    // 変形線のジオメトリ参照 (updateDeformed で頂点を更新するため)
    this._deformedGeometry = null;
    this._floorData = null;
    this._lFloor = 1;

    // nodeId → 変形ジオメトリ内のセグメントインデックスのマッピング
    this._deformedVertexMap = [];

    // LineMaterial 参照（テーマ切替・リサイズ用）
    this._undeformedMaterial = null;
    this._deformedMaterial = null;

    this._isDark = false;

    // ユーザー指定の線スタイル（null = テーマデフォルト使用）
    this._userLineStyle = {
      undeformedColor: null,
      undeformedWidth: null,
      deformedColor: null,
      deformedWidth: null,
    };
  }

  /**
   * 未変形線（グレー）・変形線（赤系）を含むシーン構築
   * @param {Object} floorData - { meta, nodes: Map<id,{id,x,y,z}>, lines: Array<{id,nodeI,nodeJ}>, freqHz, modes }
   */
  loadFloorData(floorData) {
    this._floorData = floorData;
    const { nodes, lines } = floorData;

    // L_floor・中心座標を算出（geometry.js に一元化）
    const { centerX, centerY, centerZ, lFloor } = computeFloorMetrics(nodes);
    this._lFloor = lFloor;

    const theme = this._theme();

    // --- 既存のシーン内容をクリア ---
    this._clearGroup(this._undeformedGroup);
    this._clearGroup(this._deformedGroup);
    this._clearGroup(this._axesGroup);
    this._clearGroup(this._gridGroup);
    this._clearGroup(this._labelsGroup);

    // テーマに合わせてクリアカラーを設定
    this._renderer.setClearColor(theme.clear, 1);

    // 解像度（LineMaterial に必要）
    const resolution = new THREE.Vector2(
      this._container.clientWidth,
      this._container.clientHeight
    );

    // --- 未変形線 ---
    // 座標マッピングは geometry.toThree() に一元化（data → three.js）
    const undeformedPositions = [];
    for (const line of lines) {
      const ni = nodes.get(line.nodeI);
      const nj = nodes.get(line.nodeJ);
      if (!ni || !nj) continue;
      undeformedPositions.push(...toThree(ni.x, ni.y, ni.z));
      undeformedPositions.push(...toThree(nj.x, nj.y, nj.z));
    }

    const undeformedGeo = new LineSegmentsGeometry();
    undeformedGeo.setPositions(undeformedPositions);
    this._undeformedMaterial = new LineMaterial({
      color: theme.undeformed,
      linewidth: LINE_WIDTH.undeformed,
      resolution: resolution,
    });
    const undeformedLines = new LineSegments2(undeformedGeo, this._undeformedMaterial);
    undeformedLines.computeLineDistances();
    this._undeformedGroup.add(undeformedLines);

    // --- 変形線 ---
    const deformedPositions = [];
    this._deformedVertexMap = [];
    let segmentIndex = 0;

    for (const line of lines) {
      const ni = nodes.get(line.nodeI);
      const nj = nodes.get(line.nodeJ);
      if (!ni || !nj) continue;

      // 初期状態は未変形と同じ座標 (座標マッピング適用)
      deformedPositions.push(...toThree(ni.x, ni.y, ni.z));
      deformedPositions.push(...toThree(nj.x, nj.y, nj.z));

      this._deformedVertexMap.push({
        nodeI: line.nodeI,
        nodeJ: line.nodeJ,
        segmentIndex: segmentIndex,
      });
      segmentIndex++;
    }

    this._deformedGeometry = new LineSegmentsGeometry();
    this._deformedGeometry.setPositions(deformedPositions);
    this._deformedMaterial = new LineMaterial({
      color: theme.deformed,
      linewidth: LINE_WIDTH.deformed,
      resolution: resolution,
    });
    const deformedLines = new LineSegments2(this._deformedGeometry, this._deformedMaterial);
    deformedLines.computeLineDistances();
    this._deformedGroup.add(deformedLines);

    // ユーザー指定スタイルが残っていれば再適用
    this._applyUserLineStyle();

    // --- AxesHelper ---
    const axes = new THREE.AxesHelper(this._lFloor * VIEW.AXES_SIZE_FACTOR);
    this._axesGroup.add(axes);

    // --- GridHelper ---
    const gridSize = this._lFloor * VIEW.GRID_SIZE_FACTOR;
    const grid = new THREE.GridHelper(gridSize, VIEW.GRID_DIVISIONS, theme.grid, theme.grid);
    // GridHelper は XZ 平面に作成されるため、中心をフロアに合わせる
    setThreePosition(grid, centerX, centerY, centerZ);
    this._gridGroup.add(grid);

    // --- カメラ位置調整 ---
    // 原点(軸)がビューポート左下に来るよう配置
    // 左寄り(大きな-X offset)・少し手前(-Z offset)のアングルで
    // 時計回り(1→4→3→2)の配置となる
    const dist = this._lFloor * VIEW.CAMERA_DIST_FACTOR;
    const off = VIEW.CAMERA_OFFSET;
    this._camera.position.set(
      centerY + dist * off.x, centerZ + dist * off.y, centerX + dist * off.z,
    );
    this._controls.target.set(centerY, centerZ, centerX);
    this._controls.update();

    // --- ノードIDラベル ---
    for (const node of nodes.values()) {
      const labelDiv = document.createElement('div');
      labelDiv.className = 'node-label';
      labelDiv.textContent = node.id;
      const labelObj = new CSS2DObject(labelDiv);
      setThreePosition(labelObj, node.x, node.y, node.z);
      this._labelsGroup.add(labelObj);
    }
  }

  /** 現在のテーマ色セットを返す */
  _theme() {
    return this._isDark ? THEME.dark : THEME.light;
  }

  /**
   * 変形線の各頂点座標を更新
   * @param {Function} getDisplacedZ - (nodeId) => number
   */
  updateDeformed(getDisplacedZ) {
    if (!this._deformedGeometry || !this._floorData) return;

    const startAttr = this._deformedGeometry.getAttribute('instanceStart');
    const endAttr = this._deformedGeometry.getAttribute('instanceEnd');
    if (!startAttr || !endAttr) return;

    const nodes = this._floorData.nodes;

    for (const entry of this._deformedVertexMap) {
      const ni = nodes.get(entry.nodeI);
      const nj = nodes.get(entry.nodeJ);
      if (!ni || !nj) continue;

      const zI = getDisplacedZ(entry.nodeI);
      const zJ = getDisplacedZ(entry.nodeJ);

      // 変位後の z を使って data → three.js 座標へマッピング
      startAttr.setXYZ(entry.segmentIndex, ...toThree(ni.x, ni.y, zI));
      endAttr.setXYZ(entry.segmentIndex, ...toThree(nj.x, nj.y, zJ));
    }

    // instanceStart と instanceEnd は同じ InstancedInterleavedBuffer を共有
    startAttr.data.needsUpdate = true;
    this._deformedGeometry.computeBoundingSphere();
  }

  /**
   * 各要素の表示ON/OFF切替
   * @param {Object} visibility - { undeformed, deformed, axes, grid, labels }
   */
  setVisibility({ undeformed, deformed, axes, grid, labels }) {
    if (undeformed !== undefined) this._undeformedGroup.visible = !!undeformed;
    if (deformed !== undefined) this._deformedGroup.visible = !!deformed;
    if (axes !== undefined) this._axesGroup.visible = !!axes;
    if (grid !== undefined) this._gridGroup.visible = !!grid;
    if (labels !== undefined) this._labelsGroup.visible = !!labels;
  }

  /**
   * canvas を PNG としてダウンロード
   * @param {string} filename
   * @returns {Promise<void>}
   */
  savePNG(filename) {
    return new Promise((resolve, reject) => {
      // 最新の描画を保証
      this._renderer.render(this._scene, this._camera);

      const dataURL = this._renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = filename || 'floor_mode.png';
      document.body.appendChild(link);
      try {
        link.click();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        // 例外時も <a> を確実に除去する
        document.body.removeChild(link);
      }
    });
  }

  /**
   * ウインドウリサイズ対応
   */
  resize() {
    const width = this._container.clientWidth;
    const height = this._container.clientHeight;
    if (width === 0 || height === 0) return;

    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(width, height);
    this._css2dRenderer.setSize(width, height);

    // LineMaterial の解像度を更新
    if (this._undeformedMaterial) {
      this._undeformedMaterial.resolution.set(width, height);
    }
    if (this._deformedMaterial) {
      this._deformedMaterial.resolution.set(width, height);
    }
  }

  /**
   * ジオメトリ・マテリアル・レンダラーのリソース解放
   */
  dispose() {
    // シーン内の全オブジェクトを破棄
    this._disposeGroup(this._undeformedGroup);
    this._disposeGroup(this._deformedGroup);
    this._disposeGroup(this._axesGroup);
    this._disposeGroup(this._gridGroup);
    this._disposeGroup(this._labelsGroup);

    // コントロール破棄
    if (this._controls) {
      this._controls.dispose();
      this._controls = null;
    }

    // レンダラー破棄
    if (this._renderer) {
      this._renderer.dispose();
      if (this._renderer.domElement && this._renderer.domElement.parentNode) {
        this._renderer.domElement.parentNode.removeChild(this._renderer.domElement);
      }
      this._renderer = null;
    }

    // CSS2D レンダラー破棄
    if (this._css2dRenderer) {
      if (this._css2dRenderer.domElement && this._css2dRenderer.domElement.parentNode) {
        this._css2dRenderer.domElement.parentNode.removeChild(this._css2dRenderer.domElement);
      }
      this._css2dRenderer = null;
    }

    this._deformedGeometry = null;
    this._undeformedMaterial = null;
    this._deformedMaterial = null;
    this._floorData = null;
  }

  /**
   * 現在のマテリアル色を CSS 16進数文字列で返す
   * テーマ切替・ユーザー指定の両方を反映した実際の描画色
   * @returns {{ undeformedColor: string, deformedColor: string }}
   */
  getLineColors() {
    const toHex = (mat) => {
      if (!mat) return '#000000';
      return '#' + mat.color.getHexString();
    };
    return {
      undeformedColor: toHex(this._undeformedMaterial),
      deformedColor:   toHex(this._deformedMaterial),
    };
  }

  /**
   * 線の色・太さをユーザー指定値で更新する
   * @param {object} style
   * @param {string|number|null} [style.undeformedColor] - CSS色文字列 or 0xRRGGBB
   * @param {number|null}        [style.undeformedWidth] - 線幅 px
   * @param {string|number|null} [style.deformedColor]
   * @param {number|null}        [style.deformedWidth]
   */
  setLineStyle({ undeformedColor, undeformedWidth, deformedColor, deformedWidth } = {}) {
    if (undeformedColor !== undefined) this._userLineStyle.undeformedColor = undeformedColor;
    if (undeformedWidth !== undefined) this._userLineStyle.undeformedWidth = undeformedWidth;
    if (deformedColor !== undefined)   this._userLineStyle.deformedColor   = deformedColor;
    if (deformedWidth !== undefined)   this._userLineStyle.deformedWidth   = deformedWidth;
    this._applyUserLineStyle();
  }

  /** ユーザー指定スタイルをマテリアルに適用する（内部用） */
  _applyUserLineStyle() {
    if (this._undeformedMaterial) {
      if (this._userLineStyle.undeformedColor !== null)
        this._undeformedMaterial.color.set(this._userLineStyle.undeformedColor);
      if (this._userLineStyle.undeformedWidth !== null)
        this._undeformedMaterial.linewidth = this._userLineStyle.undeformedWidth;
    }
    if (this._deformedMaterial) {
      if (this._userLineStyle.deformedColor !== null)
        this._deformedMaterial.color.set(this._userLineStyle.deformedColor);
      if (this._userLineStyle.deformedWidth !== null)
        this._deformedMaterial.linewidth = this._userLineStyle.deformedWidth;
    }
  }

  /**
   * テーマに応じてレンダラー・マテリアルの色を切り替える
   * @param {boolean} isDark
   */
  setThemeColors(isDark) {
    this._isDark = isDark;

    if (!this._renderer) return;

    const theme = this._theme();

    // Renderer clear color
    this._renderer.setClearColor(theme.clear, 1);

    // Undeformed lines: ユーザー指定がない場合のみテーマデフォルトを適用
    if (this._undeformedMaterial && this._userLineStyle.undeformedColor === null) {
      this._undeformedMaterial.color.setHex(theme.undeformed);
    }

    // Deformed lines: ユーザー指定がない場合のみテーマデフォルトを適用
    if (this._deformedMaterial && this._userLineStyle.deformedColor === null) {
      this._deformedMaterial.color.setHex(theme.deformed);
    }

    // Grid: ダーク時は控えめに抑えて線を邪魔しない
    const gridColor = theme.grid;
    this._gridGroup.traverse((child) => {
      if (child.isLineSegments && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => { if (m.color) m.color.setHex(gridColor); });
        } else if (child.material.color) {
          child.material.color.setHex(gridColor);
        }
      }
    });

  }

  /**
   * 1フレーム描画
   */
  render() {
    if (!this._renderer) return;
    this._controls.update();
    this._renderer.render(this._scene, this._camera);
    this._css2dRenderer.render(this._scene, this._camera);
  }

  // --- 内部ヘルパー ---

  /**
   * グループ内のオブジェクトをクリア (ジオメトリ・マテリアル解放)
   */
  _clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      // CSS2DObject はオーバーレイ DOM に <div> を挿入するため、
      // シーンから外すだけでなく DOM 要素も明示的に破棄する（再読込時のリーク防止）
      if (child instanceof CSS2DObject && child.element) {
        child.element.remove();
      }
    }
  }

  /**
   * グループとその子を再帰的に破棄
   */
  _disposeGroup(group) {
    this._clearGroup(group);
    if (group.parent) {
      group.parent.remove(group);
    }
  }
}

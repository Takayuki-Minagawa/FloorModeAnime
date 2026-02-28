/**
 * viewer.js — three.js シーン・描画・PNG出力
 *
 * LineSegments2 + LineMaterial で太線を描画
 * 未変形線: 0x888888 (グレー, 2px)、変形線: 0xff4444 (赤, 3px)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class FloorViewer {
  /**
   * @param {HTMLElement} canvasContainer - three.js の canvas を配置する DOM 要素
   */
  constructor(canvasContainer) {
    this._container = canvasContainer;

    // レンダラー
    this._renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setClearColor(0xffffff, 1);
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
    this._camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 10000);
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
  }

  /**
   * 未変形線（グレー）・変形線（赤系）を含むシーン構築
   * @param {Object} floorData - { meta, nodes: Map<id,{id,x,y,z}>, lines: Array<{id,nodeI,nodeJ}>, freqHz, modes }
   */
  loadFloorData(floorData) {
    this._floorData = floorData;
    const { nodes, lines } = floorData;

    // L_floor 算出
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const node of nodes.values()) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
      if (node.z < minZ) minZ = node.z;
      if (node.z > maxZ) maxZ = node.z;
    }
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    this._lFloor = Math.max(rangeX, rangeY);
    if (this._lFloor === 0) this._lFloor = 1; // ゼロ除算回避

    // 中心座標を計算
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // --- 既存のシーン内容をクリア ---
    this._clearGroup(this._undeformedGroup);
    this._clearGroup(this._deformedGroup);
    this._clearGroup(this._axesGroup);
    this._clearGroup(this._gridGroup);
    this._clearGroup(this._labelsGroup);

    // テーマに合わせてクリアカラーを設定
    this._renderer.setClearColor(this._isDark ? 0x1a1a2e : 0xffffff, 1);

    // 解像度（LineMaterial に必要）
    const resolution = new THREE.Vector2(
      this._container.clientWidth,
      this._container.clientHeight
    );

    // --- 未変形線 (グレー 0x888888, 2px) ---
    // 座標マッピング: data(x,y,z) → three.js(y, z, x)
    //   data.y → three.x (平面の横方向)
    //   data.z → three.y (鉛直方向 = three.js の上方向)
    //   data.x → three.z (平面の奥行き方向)
    const undeformedPositions = [];
    for (const line of lines) {
      const ni = nodes.get(line.nodeI);
      const nj = nodes.get(line.nodeJ);
      if (!ni || !nj) continue;
      undeformedPositions.push(ni.y, ni.z, ni.x);
      undeformedPositions.push(nj.y, nj.z, nj.x);
    }

    const undeformedGeo = new LineSegmentsGeometry();
    undeformedGeo.setPositions(undeformedPositions);
    this._undeformedMaterial = new LineMaterial({
      color: this._isDark ? 0xaaaaaa : 0x888888,
      linewidth: 2,
      resolution: resolution,
    });
    const undeformedLines = new LineSegments2(undeformedGeo, this._undeformedMaterial);
    undeformedLines.computeLineDistances();
    this._undeformedGroup.add(undeformedLines);

    // --- 変形線 (赤 0xff4444, 3px) ---
    const deformedPositions = [];
    this._deformedVertexMap = [];
    let segmentIndex = 0;

    for (const line of lines) {
      const ni = nodes.get(line.nodeI);
      const nj = nodes.get(line.nodeJ);
      if (!ni || !nj) continue;

      // 初期状態は未変形と同じ座標 (座標マッピング適用)
      deformedPositions.push(ni.y, ni.z, ni.x);
      deformedPositions.push(nj.y, nj.z, nj.x);

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
      color: this._isDark ? 0xff6666 : 0xff4444,
      linewidth: 3,
      resolution: resolution,
    });
    const deformedLines = new LineSegments2(this._deformedGeometry, this._deformedMaterial);
    deformedLines.computeLineDistances();
    this._deformedGroup.add(deformedLines);

    // --- AxesHelper ---
    const axesSize = this._lFloor * 0.5;
    const axes = new THREE.AxesHelper(axesSize);
    this._axesGroup.add(axes);

    // --- GridHelper ---
    const gridSize = this._lFloor * 1.5;
    const gridDivisions = 10;
    const gridColor = this._isDark ? 0x444466 : 0xcccccc;
    const grid = new THREE.GridHelper(gridSize, gridDivisions, gridColor, gridColor);
    // GridHelper は XZ 平面に作成されるため、中心をフロアに合わせる
    grid.position.set(centerY, centerZ, centerX);
    this._gridGroup.add(grid);

    // --- カメラ位置調整 ---
    // 原点(軸)がビューポート左下に来るよう配置
    // 正面寄り(大きな-Z offset)・少し右(小さな+X offset)のアングルで、
    // data.X増→画面右, data.Y増→画面上, 原点→画面左下 となる
    const dist = this._lFloor * 1.5;
    this._camera.position.set(centerY + dist * 0.4, centerZ + dist * 0.7, centerX - dist * 0.85);
    this._controls.target.set(centerY, centerZ, centerX);
    this._controls.update();

    // --- ノードIDラベル ---
    for (const node of nodes.values()) {
      const labelDiv = document.createElement('div');
      labelDiv.className = 'node-label';
      labelDiv.textContent = node.id;
      const labelObj = new CSS2DObject(labelDiv);
      labelObj.position.set(node.y, node.z, node.x);
      this._labelsGroup.add(labelObj);
    }
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

      // three.js 座標系: x=y, y=z(上), z=x(奥)
      startAttr.setXYZ(entry.segmentIndex, ni.y, zI, ni.x);
      endAttr.setXYZ(entry.segmentIndex, nj.y, zJ, nj.x);
    }

    // instanceStart と instanceEnd は同じ InstancedInterleavedBuffer を共有
    startAttr.data.needsUpdate = true;
    this._deformedGeometry.computeBoundingSphere();
  }

  /**
   * 各要素の表示ON/OFF切替
   * @param {Object} visibility - { undeformed, deformed, axes, grid }
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
    return new Promise((resolve) => {
      // 最新の描画を保証
      this._renderer.render(this._scene, this._camera);

      const dataURL = this._renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = filename || 'floor_mode.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      resolve();
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
   * テーマに応じてレンダラー・マテリアルの色を切り替える
   * @param {boolean} isDark
   */
  setThemeColors(isDark) {
    this._isDark = isDark;

    if (!this._renderer) return;

    // Renderer clear color
    this._renderer.setClearColor(isDark ? 0x1a1a2e : 0xffffff, 1);

    // Undeformed lines: ダーク時は明るめグレーで視認性確保
    if (this._undeformedMaterial) {
      this._undeformedMaterial.color.setHex(isDark ? 0xaaaaaa : 0x888888);
    }

    // Deformed lines: ダーク時は明るめ赤で暗背景に映える
    if (this._deformedMaterial) {
      this._deformedMaterial.color.setHex(isDark ? 0xff6666 : 0xff4444);
    }

    // Grid: ダーク時は控えめに抑えて線を邪魔しない
    const gridColor = isDark ? 0x444466 : 0xcccccc;
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

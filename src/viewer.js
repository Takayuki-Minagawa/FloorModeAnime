/**
 * viewer.js — three.js シーン・描画・PNG出力
 *
 * BufferGeometry + LineSegments で線を描画
 * 未変形線: 0x888888 (グレー)、変形線: 0xff4444 (赤)
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

    this._scene.add(this._undeformedGroup);
    this._scene.add(this._deformedGroup);
    this._scene.add(this._axesGroup);
    this._scene.add(this._gridGroup);

    // 変形線のジオメトリ参照 (updateDeformed で頂点を更新するため)
    this._deformedGeometry = null;
    this._floorData = null;
    this._lFloor = 1;

    // nodeId → 変形ジオメトリ内の頂点インデックスのマッピング
    // lines の各線分について [nodeI のindex, nodeJ のindex] を保持
    this._deformedVertexMap = [];

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

    // テーマに合わせてクリアカラーを設定
    this._renderer.setClearColor(this._isDark ? 0x1a1a2e : 0xffffff, 1);

    // --- 未変形線 (グレー 0x888888) ---
    // 座標マッピング: data(x,y,z) → three.js(x, z, y)
    //   data.x → three.x
    //   data.z → three.y (鉛直方向 = three.js の上方向)
    //   data.y → three.z (奥行き方向)
    const undeformedPositions = [];
    for (const line of lines) {
      const ni = nodes.get(line.nodeI);
      const nj = nodes.get(line.nodeJ);
      if (!ni || !nj) continue;
      undeformedPositions.push(ni.x, ni.z, ni.y);
      undeformedPositions.push(nj.x, nj.z, nj.y);
    }

    const undeformedGeo = new THREE.BufferGeometry();
    undeformedGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(undeformedPositions, 3)
    );
    const undeformedMat = new THREE.LineBasicMaterial({ color: this._isDark ? 0xaaaaaa : 0x888888 });
    const undeformedLines = new THREE.LineSegments(undeformedGeo, undeformedMat);
    this._undeformedGroup.add(undeformedLines);

    // --- 変形線 (赤 0xff4444) ---
    const deformedPositions = [];
    this._deformedVertexMap = [];
    let vertexIndex = 0;

    for (const line of lines) {
      const ni = nodes.get(line.nodeI);
      const nj = nodes.get(line.nodeJ);
      if (!ni || !nj) continue;

      // 初期状態は未変形と同じ座標 (座標マッピング適用)
      deformedPositions.push(ni.x, ni.z, ni.y);
      deformedPositions.push(nj.x, nj.z, nj.y);

      this._deformedVertexMap.push({
        nodeI: line.nodeI,
        nodeJ: line.nodeJ,
        indexI: vertexIndex,
        indexJ: vertexIndex + 1,
      });
      vertexIndex += 2;
    }

    this._deformedGeometry = new THREE.BufferGeometry();
    this._deformedGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(deformedPositions, 3)
    );
    const deformedMat = new THREE.LineBasicMaterial({ color: this._isDark ? 0xff6666 : 0xff4444 });
    const deformedLines = new THREE.LineSegments(this._deformedGeometry, deformedMat);
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
    grid.position.set(centerX, centerZ, centerY);
    this._gridGroup.add(grid);

    // --- カメラ位置調整 ---
    // 真上から見た時に原点(軸)が左下に来るよう配置
    // 座標マッピング: data.x → three.x(右), data.y → three.z(奥)
    // カメラを右手前上方(+x, +y, -z方向)に置くことで、
    // data.X増→画面右, data.Y増→画面上 となり原点が左下に来る
    const dist = this._lFloor * 1.5;
    this._camera.position.set(centerX + dist * 0.8, centerZ + dist * 0.7, centerY - dist * 0.5);
    this._controls.target.set(centerX, centerZ, centerY);
    this._controls.update();
  }

  /**
   * 変形線の各頂点Z座標を更新
   * @param {Function} getDisplacedZ - (nodeId) => number
   */
  updateDeformed(getDisplacedZ) {
    if (!this._deformedGeometry || !this._floorData) return;

    const posAttr = this._deformedGeometry.getAttribute('position');
    const nodes = this._floorData.nodes;

    for (const entry of this._deformedVertexMap) {
      const ni = nodes.get(entry.nodeI);
      const nj = nodes.get(entry.nodeJ);
      if (!ni || !nj) continue;

      const zI = getDisplacedZ(entry.nodeI);
      const zJ = getDisplacedZ(entry.nodeJ);

      // three.js 座標系: x=x, y=z(上), z=y(奥)
      posAttr.setXYZ(entry.indexI, ni.x, zI, ni.y);
      posAttr.setXYZ(entry.indexJ, nj.x, zJ, nj.y);
    }

    posAttr.needsUpdate = true;
  }

  /**
   * 各要素の表示ON/OFF切替
   * @param {Object} visibility - { undeformed, deformed, axes, grid }
   */
  setVisibility({ undeformed, deformed, axes, grid }) {
    if (undeformed !== undefined) this._undeformedGroup.visible = !!undeformed;
    if (deformed !== undefined) this._deformedGroup.visible = !!deformed;
    if (axes !== undefined) this._axesGroup.visible = !!axes;
    if (grid !== undefined) this._gridGroup.visible = !!grid;
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

    this._deformedGeometry = null;
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
    const undeformedColor = isDark ? 0xaaaaaa : 0x888888;
    this._undeformedGroup.traverse((child) => {
      if (child.isLineSegments && child.material && child.material.color) {
        child.material.color.setHex(undeformedColor);
      }
    });

    // Deformed lines: ダーク時は明るめ赤で暗背景に映える
    const deformedColor = isDark ? 0xff6666 : 0xff4444;
    this._deformedGroup.traverse((child) => {
      if (child.isLineSegments && child.material && child.material.color) {
        child.material.color.setHex(deformedColor);
      }
    });

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

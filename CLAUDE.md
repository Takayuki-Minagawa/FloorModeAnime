# Floor Mode Anime — プロジェクト規約

## 概要
床構面の鉛直成分のみのモード形を、ブラウザで3Dアニメ表示する静的Webアプリ。
GitHub Pagesでそのまま公開できる構成。

## 技術スタック（固定）
- Vite + Vanilla JS (ESM) + three.js + OrbitControls + CSS2DRenderer + LineSegments2
- サーバー処理なし（静的ホスティング前提）
- Node.js / npm

## ディレクトリ構成
```
/
  CLAUDE.md
  指示書0.md
  index.html
  package.json
  vite.config.js
  /src
    main.js          # エントリポイント
    app.js           # 初期化・モジュール結合
    viewer.js        # three.js シーン・描画・PNG出力
    animation.js     # u_i(t) 計算・再生/停止・時刻管理
    parser.js        # JSON読込・型変換・既定値適用
    validator.js     # 構造整合チェック・エラー収集
    ui.js            # UIコントロール・イベント管理
    i18n.js          # 多言語対応 (ja / en)
    styles.css       # スタイル
  /public
    /Sample
      sample_case.json
  /docs              # ビルド出力 (GitHub Pages用)
```

## 座標系（右手系）
- X軸: data.y → three.x（Node1→4方向）
- Y軸(鉛直上): data.z → three.y
- Z軸: data.x → three.z（Node1→2方向）
- 床平面の法線方向 = +Z（鉛直上向き）

## コーディング規約
- 言語: Vanilla JS (ESM), `import/export` 使用
- 浮動小数比較: `EPS = 1e-9`
- モード番号・ID: `1` 始まりの正整数
- 未記載の節点モード値: `uz = 0.0` とみなす
- エラーメッセージ形式: `E_XXX_YYY: 説明` (例: `E_NODE_DUPLICATE: nodes[5].id=12 is duplicated`)

## 変形表示スケール計算（必須）
```
A_ref = L_floor / 10
L_floor = max(maxX - minX, maxY - minY)
u_i(t) = S * A_ref * (uz_i,m / Umax_m) * sin(2π f_m t + φ0)
z_i'(t) = z_i + u_i(t)
```
- S: スライダー倍率 (0.5〜3.0, 初期値 1.0, 刻み 0.1)

## チーム構成
- **管理者**: 全体統括・レビュー・統合テスト
- **作業者1**: データ層 (parser.js, validator.js, sample_case.json)
- **作業者2**: 3D描画・アニメーション層 (viewer.js, animation.js)
- **作業者3**: UI・統合層 (ui.js, app.js, main.js, index.html, styles.css)

## モジュール間インターフェース
各作業者が独立して作業できるよう、以下のインターフェースを厳守する。

### parser.js → 外部公開
```js
export function parseFloorData(jsonString) → { meta, nodes, lines, freqHz, modes }
// nodes: Map<id, {id, x, y, z}>
// lines: Array<{id, nodeI, nodeJ}>
// freqHz: Map<modeNum, freq>
// modes: Map<modeNum, Map<nodeId, uz>>
```

### validator.js → 外部公開
```js
export function validateFloorData({ nodes, lines, freqHz, modes }) → { errors: [], warnings: [] }
// errors: Array<{code, message}>  — 致命的
// warnings: Array<{code, message}> — 非致命的
```

### animation.js → 外部公開
```js
export class AnimationController {
  constructor(floorData)           // parseFloorData の戻り値
  setMode(modeNum)                 // モード切替 → t=0, 停止
  play()                           // 再生開始
  stop()                           // 停止 (現フレーム保持)
  setScale(s)                      // 倍率 S 設定
  setSpeed(speed)                  // 再生速度倍率 (0.2〜2.0)
  getTime() → number               // 現在 t [s]
  isPlaying() → boolean
  getDisplacedZ(nodeId) → number   // z_i'(t)
  getFreqHz(modeNum?) → number     // 振動数 [Hz]
  getModeList() → Array<number>    // 利用可能モード一覧
  update(deltaTime)                // フレーム更新
}
```

### viewer.js → 外部公開
```js
export class FloorViewer {
  constructor(canvasContainer)
  loadFloorData(floorData)         // シーン構築
  updateDeformed(getDisplacedZ)    // 変形線更新
  setVisibility({ undeformed, deformed, axes, grid, labels })
  savePNG(filename) → Promise      // 停止中のみ
  resize()
  dispose()
}
```

## テスト観点（受入基準）
- サンプルJSON自動読込
- モード切替 → t=0停止リセット
- 再生/停止・フレーム保持
- 時間表示 t[s] 小数第3位
- 倍率スライダー 0.5〜3.0 反映
- 表示切替 (未変形/変形/軸/グリッド/節点番号)
- 節点番号ラベル表示（アニメ中は自動非表示）
- モード切替時に振動数 [Hz] 表示
- OrbitControls (回転/パン/ズーム)
- 停止中のみPNG保存
- 不正データでエラー一覧表示
- 日本語/英語切替
- ダーク/ライトテーマ切替
- GitHub Pages動作

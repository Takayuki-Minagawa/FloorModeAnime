# Floor Mode Anime

> **Ver. 1.0.3**

床構面の**鉛直方向モード形**をブラウザ上で 3D アニメーション表示する静的 Web アプリケーションです。
構造解析で得られた固有振動数とモード形から、選択したモードの鉛直変位を時刻歴アニメーションで可視化できます。

GitHub Pages でそのまま公開でき、サーバーサイド処理は不要です。

## 機能

- 固有振動数とモード形に基づく鉛直変位の 3D アニメーション表示
- 未変形線と変形線の同時表示による相対変位分布の視覚比較
- モード切替、再生／停止、倍率調整（0.5 〜 3.0）
- アニメーション速度調整（0.2x 〜 2.0x）
- 表示要素の ON／OFF 切替（未変形線・変形線・軸・グリッド・節点番号）
- 節点番号ラベルの 3D オーバーレイ表示（アニメーション再生中は自動非表示）
- モード切替時の振動数 [Hz] 表示
- 太線描画による視認性の向上（未変形: 2px、変形: 3px）
- 線の色・太さのカスタマイズ（未変形線・変形線それぞれ独立して変更可能）
- ダークモード／ライトモード切替（設定はブラウザに保存）
- 日本語／英語の多言語対応（設定はブラウザに保存）
- マウス操作による回転・パン・ズーム（OrbitControls）
- 停止中の画面を PNG 画像として保存
- ローカル JSON ファイルの読込とサンプルデータの自動読込
- アプリ内ヘルプ（操作ガイド）

## 動作環境

- WebGL 対応のモダンブラウザ（Chrome、Firefox、Safari、Edge 等）
- サーバー不要（静的ファイルのみで動作）

## セットアップ

```bash
# リポジトリのクローン
git clone https://github.com/Takayuki-Minagawa/FloorModeAnime.git
cd FloorModeAnime

# 依存パッケージのインストール
npm install

# 開発サーバーの起動
npm run dev
```

ブラウザで表示される URL（通常 `http://localhost:5173/FloorModeAnime/`）を開くと、サンプルデータが自動的に読み込まれます。

## ビルド

```bash
# 本番用ビルド（出力先: dist/）
npm run build

# ビルド結果のプレビュー
npm run preview
```

## 入力データ形式

単一の JSON ファイルで、以下の 4 つのキーが必須です。

```json
{
  "meta": {
    "title": "sample floor",
    "length_unit": "m",
    "mode_unit": "normalized"
  },
  "nodes": [
    { "id": 1, "x": 0.0, "y": 0.0, "z": 0.0 },
    { "id": 2, "x": 6.0, "y": 0.0, "z": 0.0 },
    { "id": 3, "x": 6.0, "y": 4.0, "z": 0.0 },
    { "id": 4, "x": 0.0, "y": 4.0, "z": 0.0 }
  ],
  "lines": [
    { "id": 1, "node_i": 1, "node_j": 2 },
    { "id": 2, "node_i": 2, "node_j": 3 },
    { "id": 3, "node_i": 3, "node_j": 4 },
    { "id": 4, "node_i": 4, "node_j": 1 }
  ],
  "freq_hz": { "1": 5.2, "2": 8.7 },
  "modes": {
    "1": { "1": 0.0, "2": 0.4, "3": 1.0, "4": 0.5 },
    "2": { "1": 1.0, "2": 0.2, "3": -0.9, "4": -0.1 }
  }
}
```

### 各キーの説明

| キー | 型 | 説明 |
|---|---|---|
| `meta` | object | タイトル・単位等の補足情報（任意） |
| `nodes` | array | 節点の定義。`id`（正整数）、`x`・`y`・`z`（座標）が必須 |
| `lines` | array | 線要素の定義。`id`・`node_i`・`node_j`（接続する節点 ID）が必須 |
| `freq_hz` | object | モード番号（文字列）をキー、固有振動数 [Hz] を値とする |
| `modes` | object | モード番号をキー、各節点の鉛直方向モード値（`uz`）を値とする |

### データ仕様の補足

- モード番号・節点 ID は `1` 始まりの正整数
- `modes` で未記載の節点は `uz = 0.0` として扱う
- `freq_hz` は正の数値のみ有効

### 座標系

入力データの座標と 3D 表示の対応は以下の通りです。右手系で、床平面の法線方向が +Z（鉛直上向き）となります。

| データ座標 | 3D 表示軸 | 方向 |
|---|---|---|
| `data.y` | three.x（赤: +X） | Node 1→4 方向 |
| `data.z` | three.y（緑: +Y） | 鉛直上方向 |
| `data.x` | three.z（青: +Z） | Node 1→2 方向 |

初期カメラ視点では、原点（軸）が左下に来るように配置されます。

```
  4 ---- 3   (上)
  |      |
  1 ---- 2   (下・左が原点)
```

## 変形表示の計算

各節点の鉛直変位は以下の式で算出されます。

```
L_floor = max(maxX - minX, maxY - minY)
A_ref   = L_floor / 10

u_i(t)  = S * A_ref * (uz_i,m / Umax_m) * sin(2 * pi * f_m * t)
z_i'(t) = z_i + u_i(t)
```

| 記号 | 説明 |
|---|---|
| `S` | 倍率スライダーの値（0.5 〜 3.0） |
| `A_ref` | 基準最大変位（床最大寸法の 1/10） |
| `Umax_m` | モード m の全節点での最大絶対モード値 |
| `f_m` | モード m の固有振動数 [Hz] |

## UI 操作

| コントロール | 説明 |
|---|---|
| 3D View | 初期表示は原点（軸）が左下に来る 3D 視点。マウスで自由に回転・パン・ズーム可能 |
| Mode | モード番号と振動数の切替。切替時に `t = 0` でリセット |
| Play / Stop | アニメーションの再生と停止（停止時はフレーム保持） |
| Time | 経過時間 `t [s]` の表示（小数第 3 位まで） |
| Speed | 再生速度の調整（0.2x 〜 2.0x、刻み 0.1） |
| Scale | 変形倍率の調整（0.5 〜 3.0、刻み 0.1） |
| Visibility | 未変形線・変形線・軸・グリッド・節点番号の表示切替 |
| Line Style | 未変形線・変形線それぞれの色（カラーピッカー）と太さ（1 〜 10px）をリアルタイムで変更。テーマ切替・データ再読込後も設定を維持 |
| Theme | ライトモード／ダークモードの切替 |
| Language | 日本語（JA）／英語（EN）の切替 |
| Save PNG | 停止中のみ有効。3D 画面を PNG 画像として保存 |
| Load JSON | ローカルの JSON ファイルを読み込んでデータを差し替え |
| Help | アプリ内操作ガイドの表示（開閉式） |

## プロジェクト構成

```
FloorModeAnime/
  index.html              # HTML エントリポイント
  package.json            # npm 設定
  vite.config.js          # Vite 設定（base, outDir）
  src/
    main.js               # エントリポイント
    app.js                # 初期化・モジュール結合
    viewer.js             # three.js シーン・描画・PNG 出力
    animation.js          # 変位計算・再生/停止・時刻管理
    parser.js             # JSON 読込・型変換
    validator.js          # データ整合チェック・エラー収集
    ui.js                 # UI コントロール・イベント管理
    i18n.js               # 多言語対応（ja / en）
    styles.css            # スタイルシート（ライト/ダーク対応）
  public/
    favicon.svg           # ファビコン
    Sample/
      sample_case.json    # サンプルデータ
  dist/                   # ビルド出力（GitHub Pages 用）
```

## GitHub Pages へのデプロイ

GitHub Actions により `main` ブランチへのプッシュ時に自動デプロイされます。

1. リポジトリの **Settings > Pages** を開く
2. **Build and deployment > Source** で **GitHub Actions** を選択
3. `main` ブランチにプッシュすると自動的にビルド・デプロイが実行される

## 技術スタック

| 技術 | バージョン | 用途 |
|---|---|---|
| [Vite](https://vitejs.dev/) | 6.x | ビルドツール・開発サーバー |
| [three.js](https://threejs.org/) | 0.170.x | 3D 描画（LineSegments2 太線・CSS2DRenderer ラベル） |
| Vanilla JS (ESM) | - | アプリケーションロジック |

## ライセンス

本プロジェクトは [MIT License](./LICENSE) のもとで公開されています。

### 使用ライブラリのライセンス

| ライブラリ | ライセンス |
|---|---|
| [three.js](https://github.com/mrdoob/three.js) | MIT |
| [Vite](https://github.com/vitejs/vite) | MIT |

全ての依存パッケージは MIT、ISC、または BSD-3-Clause ライセンスで提供されています。

## 更新履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| **Ver. 1.0.3** | 2026-03-01 | 線の色・太さカスタマイズ機能を追加（カラーピッカー + 太さスライダー） |
| Ver. 1.0.2 | 2026-02-01 | 初回リリース（GitHub Pages 公開、多言語対応、ダークモード対応） |

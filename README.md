# Floor Mode Anime

> **Ver. 1.2.0**

床構面の鉛直モード形と、版管理された物理応答アーカイブをブラウザで 3D 表示する静的 Web アプリです。GitHub Pages で動作し、サーバー処理は必要ありません。

> [!IMPORTANT]
> モード形の振幅は床寸法 `L_floor / 10` を基準にした**表示用正規化座標**です。物理変位・歩行応答・規準適合判定ではありません。周波数表示も「歩行共振帯スクリーニング」であり、居住性能の正式評価ではありません。

## 主な機能

- `floorvib-project/1` manifest による単位、座標系、節点／DOF 順、正規化、来歴、ファイル hash の照合
- manifest で宣言された `mm` 座標の `m` への明示変換と、変換前後の集計表示
- 現行 Test0202 golden（76 節点、79 要素、6 モード）の自動読込と CI 回帰照合
- モード形の再生／停止、モード切替、速度・倍率調整、タイムライン、コマ送り
- `floor-response-archive/1` の時刻歴、床面コンター、物理単位付き凡例
- 物理応答の形状正規化 ON/OFF。OFF 時は鉛直表示量と archive 値を数値一致させる
- 表示用正規化座標と物理応答 archive 値を分離した CSV／JSON 出力
- 視点プリセット、OrbitControls、表示要素切替、節点番号、最大振幅節点表示
- 日本語／英語、ライト／ダークテーマ、停止中の PNG 保存
- 入力エラー一覧と `E_XXX_YYY`／`W_XXX_YYY` コード

## セットアップ

必要環境は Node.js 20.19.0 以上と、WebGL 対応のモダンブラウザです。

```bash
git clone https://github.com/Takayuki-Minagawa/FloorModeAnime.git
cd FloorModeAnime
npm ci
npm run dev
```

通常は `http://localhost:5173/FloorModeAnime/` を開きます。本番ビルドと確認は次のとおりです。

```bash
npm run build      # dist/ へ出力
npm run preview
```

## 入力データ

### 1. 解析モデル + full mode result + manifest（推奨）

次の 3 ファイルを同時に選択またはドロップします。

- `*_calc.yaml`: 節点、線要素、`ndf`、`dof_order`、元の単位系
- `*_modal_result.json`: `frequencies_hz` と `mode_shapes_full`
- `*manifest.json` または `*manifest.yaml`: `floorvib-project/1` 接続契約

manifest の viewer profile は [public/schemas/floorvib-project-v1.viewer.schema.json](public/schemas/floorvib-project-v1.viewer.schema.json)、実例は [public/Sample/Test0202_manifest.json](public/Sample/Test0202_manifest.json) です。JSON Schema に加え、実行時には以下を相互照合します。

- canonical/source 単位とモデル単位の整合
- 右手系、鉛直軸 `z`
- 節点順、`ndf`、`dof_order = ux,uy,uz,rx,ry,rz`、順序 hash
- node/element/DOF 数、ID 重複、孤立節点
- `frequencies_hz` と `mode_shapes_full` の存在、次元、有限値
- normalization の種類と根拠、provenance
- 選択した model/result の SHA-256 とバイト数

manifest に矛盾があれば推定して続行せず、描画前に停止します。`mm-N-s` 系は manifest が明示した場合だけ、座標を `×10^-3` して `m` に変換します。legacy の 2 ファイル入力も後方互換で読めますが、解析プログラム間の受渡しには hash と順序を検証できる manifest 付き入力を使用してください。

### 2. legacy モード JSON

単一 JSON も後方互換で読み込めます。未記載の節点モード値は `uz = 0.0` です。

```json
{
  "meta": {
    "title": "sample floor",
    "length_unit": "m",
    "mode_unit": "normalized"
  },
  "nodes": [
    { "id": 1, "x": 0.0, "y": 0.0, "z": 0.0 },
    { "id": 2, "x": 6.0, "y": 0.0, "z": 0.0 }
  ],
  "lines": [
    { "id": 1, "node_i": 1, "node_j": 2 }
  ],
  "freq_hz": { "1": 5.2 },
  "modes": { "1": { "1": 0.0, "2": 1.0 } },
  "phase0": { "1": 0.0 }
}
```

モード番号と ID は 1 始まりの正整数、振動数は正の有限値、`phase0` は rad です。

### 3. 物理応答 archive

応答はモード入力と混在させず、別スキーマ `floor-response-archive/1` の単一 JSON として読み込みます。仕様は [public/schemas/floor-response-archive-v1.schema.json](public/schemas/floor-response-archive-v1.schema.json)、動作確認用の合成例は [public/Sample/response_case.json](public/Sample/response_case.json) です。

```json
{
  "schema_version": "floor-response-archive/1",
  "case_id": "sample-response",
  "units": { "length": "m", "time": "s", "response": "m/s^2" },
  "coordinates": { "vertical_axis": "z", "handedness": "right" },
  "quantity": "vertical_acceleration",
  "normalization": { "type": "physical", "reference": "solver archive" },
  "node_order": [1, 2, 3, 4],
  "nodes": [
    { "id": 1, "x": 0, "y": 0, "z": 0 },
    { "id": 2, "x": 1, "y": 0, "z": 0 },
    { "id": 3, "x": 1, "y": 1, "z": 0 },
    { "id": 4, "x": 0, "y": 1, "z": 0 }
  ],
  "faces": [{ "id": 1, "node_ids": [1, 2, 3, 4] }],
  "time_s": [0.0, 0.1],
  "response_values": [[0, 0, 0, 0], [0, 0.1, -0.1, 0]],
  "provenance": { "producer": "FloorModal", "revision": "example" }
}
```

対応量と単位は `vertical_displacement: m`、`vertical_velocity: m/s`、`vertical_acceleration: m/s^2` です。色と数値表は常に archive の物理量を示します。形状正規化 ON は分布を `L_floor / 10` で見やすくするだけです。OFF では鉛直表示量を archive 値と数値一致させますが、加速度や速度を幾何学的な変位と解釈するものではありません。

## 座標系

入力座標と three.js 座標の対応は次のとおりです。

| 入力 | three.js | 意味 |
|---|---|---|
| `data.y` | `three.x` | 水平 |
| `data.z` | `three.y` | 鉛直上 |
| `data.x` | `three.z` | 水平 |

右手系で、入力の `+z` を鉛直上向きとします。

## モード形の表示計算

```text
L_floor = max(maxX - minX, maxY - minY)
A_ref   = L_floor / 10
u_i(t)  = S * A_ref * (uz_i,m / Umax_m) * sin(2π f_m t + φ0,m)
z_i'(t) = z_i + u_i(t)
```

`S` は 0.5〜3.0、初期値 1.0 です。この `u_i(t)` と `z_i'(t)` は表示用座標であり、物理応答ではありません。CSV／JSON の先頭または `description` にも `normalized display coordinates (L/10 scaled), not physical response` を記録します。

## UI

| コントロール | 動作 |
|---|---|
| Mode | モードと振動数を切替。切替時は `t = 0`、停止 |
| 歩行共振帯スクリーニング | 歩行基本帯／倍音帯との周波数照合のみ。規準適合判定ではない |
| Play / Stop | 再生とフレーム保持停止 |
| Timeline / step | 時刻スクラブ、モードは 1 周期の 1/60、応答は archive サンプル単位で移動 |
| Speed / Scale | 再生速度 0.2〜2.0、表示倍率 0.5〜3.0 |
| Normalize display | 応答時のみ表示。OFF で archive 値と鉛直表示量を数値一致 |
| View | 等角、平面、正面、側面 |
| Visibility | 未変形、変形、軸、グリッド、節点番号 |
| Export | モード表示座標または物理応答 archive 値を CSV／JSON 化 |
| Save PNG | 停止中のみ保存 |
| Language / Theme | JA/EN、ライト/ダーク |

キーボードは `Space` が再生／停止、`←`／`→` がコマ移動、`R` が時刻リセットです。入力欄にフォーカスがある間は無効です。

## Test0202 golden

自動読込サンプルは保存済み上流成果物のコピーです。

- 76 節点、79 要素、6 モード
- 固有振動数: 25.7906314891 / 39.5631722260 / 49.9022356894 / 56.1573632763 / 62.1944313106 / 70.5419127237 Hz
- model/result の byte hash、節点・DOF 順 hash、周波数をテストで固定
- `npm run sample:manifest` で manifest を決定的に再生成

上流 Beam→FEM の一気通貫生成が復旧した後は、同じ hash テストを上流の単一生成元 CI 配布物へ接続できます。

## 検証

```bash
npm run lint
npm test
npm run build
npm audit --audit-level=high
npm run sample:manifest
```

CI は lint、全 Vitest、dependency audit、production build を実行します。golden と negative test には、順序入替え、単位混在、ID 重複、hash 不一致、正規化不明、非有限 full DOF、応答次元／単位違反を含みます。

## プロジェクト構成

```text
src/
  app.js          初期化・データ種別の統合
  parser.js       legacy、解析 pair、response archive の読込
  manifest.js     floorvib-project/1 契約照合と明示単位変換
  response.js     floor-response-archive/1 変換
  integrity.js    canonical JSON と SHA-256
  validator.js    modal/response の安全側検証
  animation.js    モード表示と応答補間
  viewer.js       three.js 線・床面コンター・PNG
  export.js       意味を分離した CSV/JSON
  ui.js           UI とイベント
  i18n.js         ja/en
public/
  Sample/         golden と応答サンプル
  schemas/        viewer 公開 JSON Schema
scripts/
  generate-test0202-manifest.mjs
tests/            Vitest unit/integration/golden tests
```

## 技術スタック

| 技術 | 固定バージョン | 用途 |
|---|---:|---|
| Vite | 8.2.1 | build/dev server、Rolldown code splitting |
| three.js | 0.185.1 | WebGL、OrbitControls、太線、CSS2D label |
| yaml | 2.9.0 | model/manifest YAML |
| Vitest | 4.1.10 | unit/integration tests |
| Vanilla JS | ESM | application |

three.js 本体、addons、YAML parser、アプリ本体を分割し、単一 JS bundle のサイズ警告を避けています。

## GitHub Pages

`main` への push で `.github/workflows/deploy.yml` が `dist/` を生成し、GitHub Pages artifact として配布します。リポジトリの **Settings > Pages > Source** は **GitHub Actions** を選択してください。

## ライセンス

[MIT License](LICENSE)。three.js、Vite、yaml など各依存のライセンスにも従います。

## 更新履歴

| バージョン | 日付 | 内容 |
|---|---|---|
| **1.2.0** | 2026-08-08 | 意味ラベル修正、manifest gate、Test0202 golden、物理応答コンター、公開 schema、依存更新、audit 解消、code splitting |
| 1.1.0 | 2026-06-21 | 初期位相、タイムライン、視点、数値表、周波数帯表示、export、Vitest |
| 1.0.3 | 2026-03-01 | 線色・太さカスタマイズ |
| 1.0.2 | 2026-02-01 | 初回リリース |

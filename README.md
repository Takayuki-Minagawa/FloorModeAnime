# Floor Mode Anime

> **Ver. 1.3.0**

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
- 日本語／英語、ライト／ダークテーマ、停止中の凡例・節点番号・条件付き PNG 保存
- 節点のクリック／ID選択、物理応答時刻歴グラフ、元サンプルCSV、ピーク時刻移動、最大絶対値包絡
- 2ケースの同期視点比較、周波数差・鉛直成分MAC・正規化形状差
- 2秒／4秒の周期固定観察再生、表示条件JSONの保存／復元、対応形式の動画保存
- Workerによる非同期読込・進捗・取消、初期サンプル失敗からの手動読込復帰
- 停止中の必要時描画、応答フレームキャッシュ、大規模数値表のページ分割
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

## 解析結果の確認と資料出力

### 節点時刻歴とピーク

「節点の確認」でIDを入力するか、3Dビューの節点付近をクリックします。選択は橙色のマーカー、最大値は緑色で区別します。応答データでは元の物理単位付きグラフと正負ピークを表示し、グラフのクリック／節点ピーク／全体ピークから時刻移動できます。時刻歴CSVは表示間引きや補間を含まない元サンプルです。不等間隔時刻と1フレームも扱います。同値ピークは最も早い時刻、さらに同値なら小さい節点IDを採用します。

「最大絶対値包絡」は節点ごとの全時刻最大絶対値を**未変形面**に着色します。異なる時刻の最大値を集めた分布であり、同時刻の変形形状ではありません。通常の数値表・CSV/JSONは引き続き現在時刻の応答値です。

### ケース比較

モードデータを読み込んだ状態で「ケース比較・鉛直MAC」に比較先ファイルを指定します。節点ID集合・座標・単位・座標契約が一致するケースだけを比較します。主画面のモードを変更すると、比較先各モードの周波数差とMAC表を更新します。比較モード選択と符号反転で並列表示を調整できます。カメラは双方向に同期し、両形状を主画面の位相で描きます。

MACは選択モデルの**鉛直成分のみ・質量重みなし**の相関です。ゼロベクトルは評価不能。近接・重複固有値、部分自由度の観測ではモード対応は一意とは限らず、合否や全DOFの直交性の判定には使いません。異なるメッシュへの自動補間は行いません。

### 観察再生、画像・動画

「モード観察用再生」の2秒／4秒は、画面上で1周期を観察するためのスロー再生です。固有振動数と解析上の時刻は維持します。通常速度へ戻しても時刻・位相は保持されます。

PNGは停止してから保存します。「画像・動画の設定」で幅1600／2400px、背景を指定でき、節点番号・時刻・単位・正規化の意味・データ識別子・応答凡例を合成します。書出し後に画面の視点と寸法を復元します。

動画も停止中から開始します。録画時間は1～30秒で、ブラウザが対応するWebMまたはMP4を選びます。実時間録画であり、厳密な等間隔フレームの解析アーカイブではありません。取消時には部分動画を保存せず、終了時には元の時刻へ戻します。非表示タブでは再生を停止し、録画を取り消します。未対応環境ではPNGを利用してください。

### 表示条件の再利用

条件JSONには視点・時刻・モード・倍率・速度・節点・表示切替・線スタイルを保存します。解析データそのものや比較先ファイルは含みません。同じ入力データを読み込んでから復元し、数値内容を含む識別子が違う場合は適用しません。不正設定を部分的に反映することはありません。

### 入力互換性と性能

legacyの数値文字列変換は維持します。版付きresponseの数値は厳密に検証します。snake/camelの同義キーが矛盾すると `E_KEY_ALIAS_CONFLICT`、未知response版は `E_RESPONSE_SCHEMA` で停止します。面は単純平面多角形を受理し、凹面を三角形分割します。退化・自己交差・非平面の面は拒否します。穴は未対応です。

読込中は段階進捗を表示し、取消や別ファイル選択が可能です。Workerが利用できる環境ではparse・検証・識別・ピーク集計を主スレッドから分離します。利用不可時は互換経路を使います。小さいサンプルから大きい応答まで同じ数値契約を適用します。元ファイルのhashはBOMを含む元バイト列で照合します。

停止・カメラ収束後は描画を休止します。応答補間は時刻ごとに共有し、数値表は200節点ずつ表示します。ブラウザズームはCSS2DRendererが正式にサポートする100%を基準とし、拡大時の節点ラベル位置は環境差があります。数値表と出力PNGでも節点を確認できます。

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
npm run test:browser  # 初回: npx playwright install chromium firefox webkit
npm run benchmark     # CPU計測。WebGL/GPU性能や改善率ではない
npm run benchmark:browser # ローカルVite＋Chromiumで読込・RAF・ヒープを計測
```

開発中はローカルで検証します。`ci.yml` は手動起動のみで、PR／ブランチpushではActionsを消費しません。`main` へのマージ時のPages workflow内で lint、全 Vitest、manifest差分照合、dependency audit、production build を実行し、成功した成果物だけを公開します。golden と negative test には、順序入替え、単位混在、ID 重複、hash 不一致、正規化不明、非有限 full DOF、応答次元／単位違反を含みます。

### Ver. 1.3.0 の実行記録（2026-09-07）

Node.js 22.18.0／Apple M4 Maxで、lint・210単体／統合テスト・build・manifest再生成差分照合を通過しました。dependency auditは脆弱性0件。Chromium／Firefox／WebKitで各13件、合計39件のブラウザテストが成功しています。WebKitによる検証は実機Safariの検証と区別します。日本語PNGの凡例・節点番号・条件表示は出力画像でも確認しました。

性能は120時刻の合成応答、1440×1000・DPR1のChromium／SwiftShaderで計測しました。停止後0.5秒間のRAF呼出しは全サイズで0です。

| 節点数 | 読込（転送・Worker・シーン構築を含む） | RAFコールバック平均 | 同p95 | 1秒再生中の呼出回数 |
|---:|---:|---:|---:|---:|
| 76 | 533.4 ms | 0.439 ms | 0.5 ms | 46 |
| 1,000 | 282.5 ms | 1.265 ms | 1.8 ms | 23 |
| 10,000 | 2,272 ms | 7.867 ms | 8.4 ms | 3 |

最初の読込はViteの初回変換も含むため、節点数だけに比例しません。RAF内処理時間は非同期GPU処理を含みません。SwiftShaderの大規模再生は遅く、上表をハードウェア描画時のFPSや変更前からの改善率と解釈しないでください。10,000節点時の読込後Chromeヒープは約209 MBで、Worker／GPUのメモリを含まない概算です。CPUのみの同期全読込は同条件の応答で約668 msでした。測定スクリプトで環境ごとに再計測できます。

## プロジェクト構成

```text
src/
  app.js          初期化・データ種別の統合
  parser.js       入力形式の公開窓口
  data/           形式別parse／validate、共通キー整形、読込処理
  loader.js       非同期読込・取消
  load-worker.js  Worker入口
  manifest.js     floorvib-project/1 契約照合と明示単位変換
  response.js     floor-response-archive/1 変換
  integrity.js    canonical JSON と SHA-256
  validator.js    modal/response の安全側検証
  animation.js    モード表示と応答補間
  viewer.js       three.js 線・床面コンター・PNG
  export.js       意味を分離した CSV/JSON
  ui.js           基本UI・共通再生操作の配線
  shell.js        データなしでも利用可能なファイル読込
  tools-ui.js     節点確認・ピーク・設定・動画
  compare-ui.js   2ケース比較と同期カメラ
  analysis.js     ピーク、時刻歴、鉛直成分MAC、データ識別
  history-chart.js 時刻歴グラフと極値を保つ表示間引き
  settings.js     表示条件の検証・保存
  surface.js      平面多角形の検証・三角形分割
  capture.js      凡例・条件の合成と出力補助
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
| **1.3.0** | 2026-09-07 | 状態同期・読込復帰、必要時描画、面分割検証、時刻歴・ピーク・包絡、比較MAC、条件付きPNG・動画、表示条件保存、Worker読込、ローカルブラウザ検証 |
| 1.2.0 | 2026-08-08 | 意味ラベル修正、manifest gate、Test0202 golden、物理応答コンター、公開 schema、依存更新、audit 解消、code splitting |
| 1.1.0 | 2026-06-21 | 初期位相、タイムライン、視点、数値表、周波数帯表示、export、Vitest |
| 1.0.3 | 2026-03-01 | 線色・太さカスタマイズ |
| 1.0.2 | 2026-02-01 | 初回リリース |

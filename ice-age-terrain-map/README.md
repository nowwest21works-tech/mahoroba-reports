# 氷河期地形マップ｜Pilot 01

現在の陸上・海底標高と指定海水準から、約2万年前の陸域・海域を概算する歴史地形シミュレーターです。Phase 2では、Phase 1/1.5で検証したGEBCO_2026実データを13海水準のPMTilesへ変換し、React / MapLibreによるWeb MVPで切り替えられるようにしました。

> この地図は、現在の陸上・海底地形と推定海水準から生成した概算モデルです。当時の堆積、侵食、地殻変動、河川流路、地表面を完全に復元したものではありません。
>
> 「約2万年前」「海面 −120 m」は代表的なモデル値です。年代、地域、研究、海水準指標によって差があります。

## Phase 2の完了範囲

- −140 m〜−80 mを5 m刻みとした13レイヤー
- 4近傍の外洋連結判定と決定的な再生成
- 未簡略化GeoJSONの保存、0.005°簡略版、PMTiles配信版の分離
- Natural Earth 10mの現在海岸線・主要都市・主要河川
- React / TypeScript / Vite / MapLibre / PMTiles Web MVP
- URLによる海面・カメラ・レイヤー・解説ポイントの共有
- Vitest、Pytest、Playwrightによる単体・データ・PC/360px E2Eテスト

架空の地形ポリゴンや見た目だけのモックは含みません。Git commit、push、Vercelデプロイはこの段階では行いません。

## 必要環境

- Python 3.11–3.13
- Python packages: NumPy, SciPy, Rasterio（GDAL同梱wheel可）, Shapely, Matplotlib
- GEBCO公式ダウンロードサービスへ接続できるネットワーク
- Node.js 24系、npm 11系

Windows PowerShell の例:

```powershell
cd ice-age-terrain-map
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Web MVPを起動

```powershell
cd app
npm install
npm run dev
```

本番用静的ファイルは`npm run build`で`app/dist/`へ生成します。

## Phase 2データを再生成

GEBCO原本を取得済みの状態で、Natural Earth参照データと13レイヤーを生成します。

```powershell
.\.venv\Scripts\python.exe scripts\download\download_natural_earth.py
.\.venv\Scripts\python.exe scripts\preprocess\build_reference_layers.py
.\.venv\Scripts\python.exe scripts\preprocess\build_phase_2_data.py
```

主な出力:

- `outputs/phase2/raw/*.geojson`: 未簡略化、Git管理外
- `data/processed/phase2/delivery/*.geojson`: 配信用簡略版、Git管理外
- `app/public/data/terrain/*.pmtiles`: 13海水準、合計6,514,649 bytes
- `outputs/phase2/data-statistics.json`: 面積、頂点数、容量、処理時間
- `outputs/phase2/manifest.json`: Phase 2成果物manifest

## Phase 1データを再生成

### 1. GEBCOサブセットを取得

```powershell
.\.venv\Scripts\python.exe scripts\download\download_gebco.py
```

既定範囲は `120°E–150°E, 20°N–50°N` です。外洋からの連結判定を成立させるため、表示範囲より広い余白を含めています。スクリプトは公式APIへジョブを登録し、完了後に GeoTIFF を `data/raw/` へ展開し、チェックサムと取得条件を `data/metadata/` に保存します。

既に登録済みのジョブを再利用する場合:

```powershell
.\.venv\Scripts\python.exe scripts\download\download_gebco.py --basket-id <basket-id>
```

### 2. −120 mモデルと出力を生成

```powershell
.\.venv\Scripts\python.exe scripts\preprocess\build_lgm_model.py `
  --input data\raw\gebco_2026_japan.tif `
  --sea-level -120
```

生成物:

- `outputs/lgm-japan-minus-120m.png`
- `outputs/lgm-japan-minus-120m.geojson`
- `outputs/lgm-tokai-minus-120m.png`
- `outputs/lgm-tokai-minus-120m.geojson`
- `outputs/manifest.json`

GeoJSONには次の区分を持たせます。

- `DATA / current_coastline`: GEBCO標高0 mと外洋接続から抽出した現在海岸線の表示用近似
- `MODEL / lgm_land`: 指定海水準と外洋接続から算出した推定陸域
- `MODEL / exposed_shelf`: 現在は海域、指定海水準では陸域となる範囲

## テスト

```powershell
.\.venv\Scripts\python.exe -m pytest tests --basetemp data\processed\pytest
cd app
npm run lint
npm run format
npm run test
npm run build
npm run test:e2e
```

ローカル本番プレビューの性能計測は、別端末で`npm run preview -- --host 127.0.0.1 --port 4174`を起動後、`npm run measure:performance`で実行します。

## 判定方法

1. `標高 <= 指定海面` を水域候補とする
2. ラスタ外周に接する水域候補を外洋シードとする
3. 4近傍の連結成分探索で、シードへ接続する水域だけを推定海域とする
4. 推定海域以外を推定陸域とする
5. 現在海域は同じ処理を海面 0 m で計算する
6. 推定陸域と現在海域の積を新たに露出した陸棚とする

この方法は内陸の窪地を自動的に海にしない一方、計算範囲の外周が外洋を十分含むことを前提とします。

## 文書

- [データソースと利用条件](docs/data-sources.md)
- [モデル仮定と未解決事項](docs/model-assumptions.md)
- [前処理・Web MVP設計](docs/architecture.md)
- [調査結果・判断・制約](docs/research-notes.md)
- [Phase 2実装記録](docs/phase-2-implementation.md)
- [UI判断](docs/ui-decisions.md)
- [デプロイ計画](docs/deployment-plan.md)

## クレジット

GEBCO Bathymetric Compilation Group 2026 (2026). *The GEBCO_2026 Grid – a continuous terrain model for oceans and land at 15 arc-second intervals.* doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa

本成果物はGEBCO、IHO、IOCによる承認・公式見解を示すものではなく、航海・安全用途には使用できません。

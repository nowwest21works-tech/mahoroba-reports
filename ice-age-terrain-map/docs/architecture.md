# アーキテクチャ

## Phase 1｜静止地図

```text
GEBCO official subset API
  -> GeoTIFF (Git管理外)
  -> bbox crop
  -> threshold at sea level
  -> ocean-connected flood fill
  -> present/model masks
  -> polygonize + simplify
  -> GeoJSON / PNG
```

処理責務:

- `scripts/download/download_gebco.py`: 公式範囲指定API、ポーリング、zip検証、展開、メタデータ
- `scripts/preprocess/model.py`: 閾値・外洋連結・公開用の純粋関数
- `scripts/preprocess/build_lgm_model.py`: Rasterioによるwindow読込、ベクトル化、描画、出力
- `tests/`: 閾値と連結成分の回帰テスト

## Phase 2｜Web地図MVP

実装構成:

```text
app/
  src/
    App.tsx
    MapView.tsx
    content.ts
    state.ts
    terrainData.ts
  public/data/
    reference/
    terrain/
  tests/unit/
  tests/e2e/
```

- React + TypeScript + Vite
- MapLibre GL JS
- Vitest: レイヤー定義、海面選択、DATA/MODEL/STORY表示契約
- Playwright: PCと360 px、レイヤーON/OFF、スライダー、注意書き、URL復元、カメラ保持
- MapLibreのPMTiles protocolで、選択中の海水準アーカイブだけを遅延読込
- 河川は初期OFFかつ遅延読込。都市・解説ポイントは軽量参照データ
- Vercel: `app/dist/`の静的配信が可能。今回の作業ではデプロイしない

## 配信形式の判断

### Pilot 01: GeoJSON

採用理由:

- −120 m 1レイヤーの形状・属性・分類を人が直接確認しやすい
- 生成結果のデバッグが容易
- DATA / MODEL属性を保持できる

制約:

- 全国・13海水準へ増やすと転送量・解析時間・ブラウザメモリが増える
- 大きな単一FeatureCollectionはモバイルに不向き

### Web MVP: PMTilesを採用

- 単一ファイルのベクトルタイルをHTTP Range Requestで読む
- MapLibre GL JSからカスタムprotocolで利用可能
- 画面に必要なタイルだけを取得できる
- タイルサーバーなしでオブジェクトストレージ/CDNへ置ける
- 13ファイル合計6,514,649 bytes。各レイヤー462,341〜539,671 bytes
- 初期−120 mは492,057 bytesのアーカイブからRange Requestで必要部分だけ取得

未簡略化GeoJSON合計124,871,978 bytes、簡略化GeoJSON合計39,596,547 bytesに対し、PMTilesは約6.5 MBです。ブラウザへGeoJSON全体を渡さないPMTilesをMVPの正本配信形式とします。

GEBCO原本や未簡略化GeoJSONはGit/Vercelへ同梱しません。現在のPMTiles 13ファイルは合計約6.5 MBなので静的配信可能な規模ですが、Phase 3で全国高詳細や年代を増やす場合はRange RequestとCORSを返す外部オブジェクトストレージへ分離します。

### ラスタタイル

陰影起伏・標高背景には適しますが、13海水準ごとの陸域切替をラスタだけで持つとファイル数が増え、属性（DATA/MODEL）やクリック説明が弱くなります。背景用に限定して併用する候補です。

## 境界

- Phase 1出力の確認前にWeb UIを完成扱いしない
- `data/raw/` と `data/processed/` はGit管理しない
- 出典・モデル値・物語を同じスタイル・確度で扱わない
- ランタイムで重い標高計算を行わず、海水準別レイヤーを事前生成する
- 生成失敗時はレイヤーを表示しない。架空データへフォールバックしない

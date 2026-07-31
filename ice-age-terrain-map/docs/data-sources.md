# データソースと利用条件

調査日: 2026-07-31

## DATA｜採用データ

### GEBCO_2026 Grid

- 提供: General Bathymetric Chart of the Oceans (GEBCO)
- 内容: 陸上と海底を連続的に含む全球地形モデル
- 解像度: 15 arc-second
- 座標: 緯度経度グリッド。標高値はメートル
- 取得: GEBCO公式の範囲指定ダウンロードアプリから GeoTIFF を生成
- Pilot 01範囲: `120°E–150°E, 20°N–50°N`
- 原本: `data/raw/` にのみ保存しGit管理しない

推奨クレジット:

> GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain model for oceans and land at 15 arc-second intervals. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa

公式利用条件ではGEBCO Gridはパブリックドメインで無償利用可能です。ただし、出典表示、公式承認を示唆しないこと、誤認を招く表示をしないことが求められます。航海や海上安全用途には利用できません。

## DATA｜現在の海岸線

Phase 1のGEBCO標高0 m近似は検証用として保持します。Phase 2の比較表示にはNatural Earth 10m coastline 4.1.0とminor islands coastline 4.1.0を採用しました。現在海岸線は`DATA`、GEBCOへ海面条件を適用した推定海岸線は`MODEL`として別の線種で表示します。

Natural Earthはpublic domainで、全国一括取得、Web向け簡略度、クレジットの扱いやすさを優先した選択です。測量・行政上の厳密な海岸線ではなく、GEBCO格子とは局所的に位置が一致しません。比較調査は`docs/current-coastline-options.md`に記録しています。

## DATA｜現代都市・主要河川

- 都市: Natural Earth 10m populated places 5.1.2から東京、名古屋、大阪、福岡、札幌、仙台、広島、那覇を抽出
- 河川: Natural Earth 10m rivers and lake centerlines 5.0.0を日本周辺bboxで抽出
- 配布条件: Natural Earth public domain
- 取得元: `https://naturalearth.s3.amazonaws.com/`
- 取得ファイル名、URL、SHA-256: `data/metadata/natural-earth.json`

河川は現在の概略位置を示す参照レイヤーであり、当時の河道を示しません。初期表示ではOFFとし、ONにしたときだけGeoJSONを取得します。

## 取得・切り出し方法

1. GEBCO公式ダウンロードアプリの `GEBCO 2026 / Global / Bathymetry` を選択
2. WGS84緯度経度で対象bboxを指定
3. GeoTIFFを選択してbasketを送信
4. 完了したzipを取得し、GeoTIFFのみ展開
5. SHA-256、bbox、basket IDをメタデータへ記録
6. Rasterio/GDAL互換処理で対象表示範囲をwindow切り出し

全世界版は数GB規模なので取得せず、対象地域だけを公式サービス側で切り出します。

## 精度・品質上の注意

- GEBCOは異なる測量密度・品質のデータを統合・補間した情報製品です。
- 15 arc-secondは日本周辺で概ね数百m級の格子であり、細い水路や局所地形を保証しません。
- 浅海域には平均海面と異なる鉛直基準を持つ入力が含まれる場合があります。
- GEBCOは深海を主目的とする製品で、浅い陸棚の精密な復元用データではありません。
- 当時の地形そのものではなく、現在地形へ海水準条件を適用する入力です。

## 公式参照

- https://www.gebco.net/data-products/gridded-bathymetry-data
- https://www.gebco.net/data-products/gridded-bathymetry-data/gebco2026-grid
- https://download.gebco.net/
- https://www.gebco.net/disclaimer
- https://www.naturalearthdata.com/about/terms-of-use/
- https://www.naturalearthdata.com/downloads/10m-physical-vectors/

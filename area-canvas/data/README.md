# area-canvas のデータ生成について

`administrative-boundary/`・`railway/`・`road/` の各 `aichi.geojson` はPublic配布対象です。
`river/aichi.geojson`も国土交通省「国土数値情報」から生成しますが、W05の利用条件により
Internal / Local QA専用とし、`.gitignore`でPublic配布対象から除外しています。
いずれも形状を推測・生成AIで補完していません。

実データは国土数値情報（国交省）から生成します。生成手順：

```bash
npm install
# nlftp.mlit.go.jp へネットワーク到達できる環境で実行すること
npm run data:administrative-boundary
npm run data:railway
npm run data:road
# Public配布対象3レイヤー
npm run data:area-canvas:public
# Internal / Local QA専用（W05生成物はGitへ含めない）
npm run data:river
npm run data:area-canvas
```

各スクリプトのdownload sourceは、2026-08-20に公式ページの表示ファイル名、HTMLの
`DownLd(...)`引数、HTTP 200、`Content-Type: application/zip`、archive内部ファイルを
照合済みです。

- 行政区域(N03)：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html>
- 鉄道(N02)：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2022.html>
- 道路(N13)：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N13-2024.html>
- 河川(W05)：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W05.html>

## 実データ監査（2026-08-20）

共通条件：WGS84 GeoJSON、座標精度0.000001度、簡略化なし。鉄道・道路・河川は
N03-2025愛知県行政区域でclipしています。

| Layer | Dataset | 元zip容量 | 生成後容量 | Feature数 | Geometry | 座標数 | invalid / empty / non-finite | bbox |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- |
| 行政区域 | N03-2025 | 5,849,982 bytes | 7,002,814 bytes | 1,033 | Polygon 1,033 | 237,769 | 0 / 0 / 0 | 136.671033256, 34.573540279, 137.838115668, 35.424788252 |
| 鉄道 | N02-2022 | 17,600,998 bytes | 660,065 bytes | 1,697 | LineString 1,695 / MultiLineString 2 | 16,507 | 0 / 0 / 0 | 136.71103, 34.66671, 137.717421, 35.393059 |
| 道路 | N13-2024 | 134,269,405 bytes（6メッシュ合計） | 7,726,443 bytes | 3 | MultiLineString 3 | 333,270 | 0 / 0 / 0 | 136.672079, 34.578847, 137.836243, 35.418971 |
| 河川（Internalのみ） | W05-2008（愛知） | 4,583,344 bytes | 6,930,186 bytes | 5,953 | LineString 5,948 / MultiLineString 5 | 227,178 | 0 / 0 / 0 | 136.671203, 34.581905, 137.831104, 35.422267 |

### 行政区域（N03-2025）

- 公式参照ページ：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html>
- download source：<https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2025/N03-20250101_23_GML.zip>
- データ基準日：2025-01-01
- 利用条件：CC BY 4.0。国土地理院への申請等が必要になる場合がある旨の公式注記あり
- CRS：JGD2011 / 緯度経度。配布GeoJSONを使用
- schema：`N03_001`（都道府県名）を採用。全1,033件が`愛知県`、null率0
- filter：`N03_001 === '愛知県'`
- 除外：他都道府県、geometry欠損
- 既知の制約：境界未定地域は原典由来。2026年版ではなく、指定された2025年版を使用

### 鉄道（N02-2022）

- 公式参照ページ：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2022.html>
- download source：<https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-22/N02-22_GML.zip>
- データ基準日：2022-12-31
- 利用条件：国土数値情報ダウンロードサイト利用規約に基づくオープンデータ
- CRS：JGD2011 / 緯度経度。archive同梱UTF-8 GeoJSONを使用
- schema：`N02_001`鉄道区分、`N02_002`事業者種別、`N02_003`路線名、
  `N02_004`運営会社、駅のみ`N02_005`駅名・`N02_005c`駅コード・`N02_005g`グループコード
- 内訳：鉄道区間1,154件、駅543件
- filter：路線・駅の両ファイルをN03愛知県行政区域でclip
- 除外：行政界外、geometry欠損、対象外geometry
- 既知の制約：駅も点ではなく鉄道路線の一部分を表す線。指定された2022年版を使用

### 道路（N13-2024）

- 公式参照ページ：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N13-2024.html>
- 利用条件：CC BY 4.0。測量法に関する公式注記あり
- CRS：JGD2011 / 緯度経度。公式GeoJSONを使用
- 対象2次メッシュ：5136、5137、5236、5237、5336、5337
- download source：`https://nlftp.mlit.go.jp/ksj/gml/data/N13/N13-24/`
  配下の`N13-24_{mesh}_GEOJSON.zip` 6件
- schema：道路分類fieldは`N13_003`、文字列コード。null率0
- filter：`1`（国道）16,322件、`2`（都道府県道）54,156件、
  `4`（高速自動車国道等）2,932件
- 除外：`3`市区町村道等、`5`その他、`6`不明、N03行政界外、empty/invalid geometry
- 表示最適化：元73,410 Featureを`N13_003`の3区分ごとのMultiLineStringへ集約
- 簡略化：なし。333,270座標、73,422 line part、bbox、全segmentを維持
- 既知の制約：`N13_003`では主要地方道と一般都道府県道を区別できないため、
  都道府県道は全て含む。路線名称属性はないため`route-labels.json`はHuman Gate

generator修正の根拠：

| 項目 | Before | After | 理由 |
| --- | --- | --- | --- |
| `ROUTE_CLASS_FIELD_CANDIDATES` | `N13_001`, `route_class`, `road_class` | `N13_003` | `N13_001`はデータ登録日。公式schemaと実データで道路分類は`N13_003` |
| `ALLOWED_ROUTE_CLASS_VALUES` | 日本語名称 | `1`, `2`, `4` | 実データは名称ではなく公式コード値 |
| 配布単位 | 単一zip想定 | 6メッシュ | N13-2024は2次メッシュ単位配布 |
| 表示Feature | 73,410 | 3 | GIS検索ではなく交通骨格表示が目的。区分ごとに集約し座標は削除しない |

#### 道路表示最適化の比較（2026-08-20）

| 項目 | Before | Candidate A（採用） | 変化 |
| --- | ---: | ---: | ---: |
| Feature数 | 73,410 | 3 | -99.996% |
| line part数 | 73,422 | 73,422 | 変更なし |
| 座標数 | 333,270 | 333,270 | 変更なし |
| 容量 | 22,774,875 bytes | 7,726,443 bytes | -66.1% |
| PC道路ON wall time（同一CLI手順） | 約8.7秒 | 約3.1秒 | 約64%短縮 |
| 1366×1024道路ON wall time | 未計測 | 約3.7秒 | Public QA値 |

Candidate Aで明確な改善が得られ、segment集合・bboxを完全維持できたため採用しました。
Candidate B（追加simplification）はgeometry変更リスクに対して現時点の必要性がなく、
Candidate C（zoom / viewport分割）はv0.1の複雑度を増やすため見送りました。

### 河川（W05-2008 愛知県、Internal / Local QA専用）

- 公式参照ページ：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W05.html>
- download source：<https://nlftp.mlit.go.jp/ksj/gml/data/W05/W05-08/W05-08_23_GML.zip>
- データ基準年度：2008年度
- 利用条件：**非商用**
- CRS：JGD2000 / 緯度経度。`Stream.shp`をWGS84へ変換
- schema：`W05_001`水系域コード、`W05_002`河川コード、`W05_003`区間種別、
  `W05_004`河川名ほか
- filter：`Stream.shp`のみを採用し、N03愛知県行政区域でclip
- 除外：`RiverNode.shp`、行政界外、geometry欠損
- Public境界：`river/aichi.geojson`は`.gitignore`対象。通常URLではcheckboxをdisabledにし、
  request自体を送信しない。内部検証時のみ`?internalData=1`で有効化
- generatorと公式URLは再現性・出典確認のためRepositoryへ残す
- 自動検査：`npm run check:area-canvas-public`
- 既知の制約：古い2008年度データであり、商用利用不可。Public Repository、GitHub Pages、
  顧客Pilotへ生成物を含めない

### 愛知県外geometry監査

N03行政界でclip後、同じ行政界をeraseして再検査しました。実質的な県外geometryは除外済みです。
GeoJSON出力時の0.000001度丸めにより、境界上に鉄道約0m、道路約2m、河川約27m相当の
微小sliverが再読込時に検出されます。これは県外路線を意図的に収録したものではありません。

## 道路名ラベル（route-labels.json）

`road/route-labels.json` は国道・県道の路線名を手動登録するファイルです。
国土数値情報の道路データ(N13)には路線名の属性が無いため、現地確認済みの地点だけを
以下の形式で追加してください。

```json
[
  { "name": "国道19号", "lat": 35.1709, "lng": 136.8815 }
]
```

未登録の地点にラベルを表示することはありません（座標・路線名を推測しない）。

## 共通の既知制約

- generatorはWindowsでは`tar.exe`、その他のOSでは`unzip`を使用します。
- 鉄道・道路・河川を単独生成する場合も、先に行政区域を生成してください。
- 生成日時はGeoJSONの`metadata.generatedAt`に記録されます。
- `npm run check:area-canvas-public`でW05生成物がignore済み・Git追跡なしであることを確認します。
- 公開・商用利用時は、Public対象3datasetの最新利用規約と測量法上の条件を再確認してください。

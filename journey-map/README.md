# まほろば顧客条件マップ

`journey-map`は、候補地点の距離圏、複数種類の図形、ハザード情報を一つの地図上で扱う詳細版の静的Webアプリです。main commit `e092789b4be717e52ab39083ada824c77ad7a7c5`時点のv0.3技術MVPを、内部機能を変えずに`map-circles`から移設しています。

## 目的

土地探しの検討条件を地図上の図形として整理し、将来の案件単位管理へつながる技術baselineを提供します。

## 想定利用場面

- 候補地点、検討範囲、路線、区域の地図上での整理
- Marker、Circle、Line、Polygonを使った条件の可視化
- 描画・編集操作とGeoJSON／Memory Store同期の技術検証
- `household → journey → mapProject`単位の架空案件Pilot

## 搭載機能

- Marker、Circle、Line、Polygon
- 図形の描画、編集、移動、削除
- Leaflet-Geoman Free 2.20.0 toolbar
- canonical GeoJSON FeatureCollectionとの同期
- ブラウザメモリ上のMemory Store
- `household → journey → mapProject`データモデル
- transaction失敗時のrollback
- canonical Leaflet layer eventによる更新
- 既存の地図クリック／検索によるCircle追加との互換
- 4種類のハザード表示

## 非搭載機能

- 永続保存、IndexedDB、localStorage
- import、export、undo、redo
- 認証、backend、外部database
- CircleMarker、Rectangle、Text、Cut、Rotate
- holes、MultiPolygon、MultiLineString、GeometryCollection
- viewportとハザード状態のStore同期

## 起動URL

Repository rootでローカルサーバーを起動します。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

ローカルURL：

```text
http://127.0.0.1:8000/journey-map/
```

公開予定URL：

```text
https://nowwest21works-tech.github.io/mahoroba-reports/journey-map/
```

## 個人情報と保存

- 顧客氏名、正確な住所、家族情報、勤務先などの実顧客情報を入力しないでください。
- Pilotでは`HH-001`、`検討1`、`架空地点A`などの中立的な架空データだけを使用してください。
- 図形とデータモデルはブラウザメモリだけに保持されます。
- リロード、タブ終了、ブラウザ終了で全データが消えます。

## まほろば距離円マップとの違い

`map-circles`の軽量版はCircleの素早い追加・比較に限定しています。この詳細版は4種類の図形、Geoman編集、GeoJSON同期、Memory Store、rollback、案件管理用データモデルを含みます。

## Test

```powershell
npm.cmd run test:journey-map:domain
npm.cmd run test:journey-map:e2e
npm.cmd run test:journey-map
```

Node testはdomain、GeoJSON Adapter、Memory Storeを確認します。Playwrightは4種類の図形、create／edit／drag／remove、rollback、canonical layer event、Map同名event非commit、Drag後Edit、reload初期化、Web Storage未使用、PC／360px表示、console error、page error、PII guard、asset manifest、GitHub Pages配下path、外部通信mockを確認します。

# まほろば顧客条件マップ

`journey-map`は、土地探しの条件を地点・円・線・範囲として地図上に整理し、匿名の顧客コードと案件名ごとにブラウザ内へ保存する詳細版Webアプリです。

## 目的と想定利用場面

- 候補地点、駅、検討路線、優先エリアを1枚の地図で整理する
- 打ち合わせごとに条件地図を保存し、次回に読み込んで更新する
- 別案を複製し、元の地図を残したまま比較する
- JSONバックアップを手元へ書き出し、同じアプリへ復元する

## 搭載機能

- Marker、Circle、Line、Polygonの描画・編集・移動・削除
- Leaflet-Geoman Free 2.20.0の日本語操作表示
- GeoJSON FeatureCollectionとMemory Storeの同期、transaction失敗時のrollback
- `household → journey → mapProject`のDomainモデル
- 匿名メタデータ（顧客コード、案件名、地図名）
- IndexedDBによる顧客・案件別のローカル保存
- 保存済み地図の一覧表示、読込、更新保存、複製
- viewportと4種類の図形の復元
- `.mahoroba-map.json`形式のJSONバックアップ書出し／読込
- 既存の地図クリック・住所検索によるCircle追加との互換

## 非搭載機能

- 保存済み地図の削除
- 自動保存
- PDF／PNG出力
- undo／redo
- 認証、backend、クラウドdatabase、共有URL
- localStorage、sessionStorage
- import時のschema migration

## 保存方式

- Database: `mahorobaJourneyMaps`
- Object Store: `mapProjects`
- keyPath: `projectId`
- index: `updatedAt`
- schemaVersion: `1`

保存recordは次の項目だけを保持します。

- `schemaVersion`
- `projectId`
- `householdCode`
- `journeyName`
- `mapProjectName`
- `featureCollection`
- `viewport`
- `createdAt`
- `updatedAt`

`projectId`はUUID、日時はcanonical UTC ISO-8601です。保存一覧は`updatedAt`の新しい順に表示します。初回保存でIDを発行し、以後の保存は同じIDを更新します。

保存先は現在使用しているブラウザのIndexedDBです。別の端末や別のブラウザには自動同期されません。ブラウザデータを消去すると保存済み地図も消えるため、必要な地図はJSONバックアップを書き出してください。

## 個人情報を入力しないルール

実顧客情報は入力しないでください。顧客名、家族名、電話番号、メールアドレス、正確な自宅住所、勤務先、年収、借入情報は保存対象に追加していません。

次のような匿名情報だけを使います。

- 顧客コード: `HH-001`
- 案件名: `土地探し 第1回`
- 地図名: `通勤圏・優先エリア整理`

入力内容は自動保存されません。画面の「保存」を押した時だけIndexedDBへ保存されます。

## JSONバックアップ

書出しファイル名の例:

```text
HH-001_土地探し第1回_通勤圏・優先エリア整理.mahoroba-map.json
```

読込時はschemaVersion、必須項目、UUID、canonical timestamp、FeatureCollection、Feature IDの重複、kindとgeometry typeの整合、unknown fieldを検証します。不正なファイルは拒否し、現在表示中の地図を変更しません。

同じ`projectId`のバックアップを読み込むと、そのIDの保存recordを復元します。

## ローカル起動

repository rootでHTTP serverを起動します。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

ローカルURL:

```text
http://127.0.0.1:8000/journey-map/
```

公開予定URL:

```text
https://nowwest21works-tech.github.io/mahoroba-reports/journey-map/
```

## 軽量版との違い

`map-circles`の「まほろば距離円マップ」は、円を素早く複数描く用途に限定した軽量版です。この詳細版は4種類の図形、Geoman編集、GeoJSON同期、案件単位のIndexedDB保存、複製、JSONバックアップを備えます。

## Test

```powershell
npm.cmd run test:journey-map:domain
npm.cmd run test:journey-map:e2e
npm.cmd run test:journey-map
npm.cmd run test:maps
```

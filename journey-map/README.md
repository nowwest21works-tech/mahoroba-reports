# まほろば顧客条件マップ

`journey-map`は、土地探しの条件を地点・円・線・範囲として地図上に整理し、匿名の顧客コードと案件名ごとにブラウザ内へ保存する詳細版Webアプリです。

## 目的と想定利用場面

- 候補地点、駅、検討路線、優先エリアを1枚の地図で整理する
- 打ち合わせごとに条件地図を保存し、次回に読み込んで更新する
- 別案を複製し、元の地図を残したまま比較する
- JSONバックアップを手元へ書き出し、同じアプリへ復元する

## 搭載機能

- Marker、Circle、Line、Polygonの描画・編集・移動・削除
- Markerの`label`を使う日本語の地図メモ配置・選択・更新
- Leaflet-Geoman Free 2.20.0の日本語操作表示
- GeoJSON FeatureCollectionとMemory Storeの同期、transaction失敗時のrollback
- `household → journey → mapProject`のDomainモデル
- 匿名メタデータ（顧客コード、案件名、地図名）
- IndexedDBによる顧客・案件別のローカル保存
- 保存済み地図の一覧表示、読込、更新保存、複製
- viewportと4種類の図形の復元
- `.mahoroba-map.json`形式のJSONバックアップ書出し／読込
- 現在の地図表示をそのまま保存するPNG画像書き出し
- A4横1ページの印刷用画面から行うPDF保存
- 愛知県の区域区分を静的GeoJSONから遅延読込する参照レイヤー
- 既存の地図クリック・住所検索によるCircle追加との互換

## 地図メモ

「地図メモ」へ120文字以内の短い日本語メモを入力し、「メモを地図に置く」を押してから地図上をクリックします。メモは既存のMarker Featureとして追加され、`properties.label`へ本文を保存します。新しいFeature kind、保存recordのtop-level field、IndexedDB schema、schemaVersionは追加しません。

地図上のメモは常時表示されます。改行を保持し、最大4行程度・固定色の吹き出しに収めます。表示内容はDOMの`textContent`として扱い、HTML、script、style、linkを実行しません。

メモをクリックすると選択状態になり、内容が入力欄へ戻ります。「選択中のメモを更新」で本文を変更できます。位置の変更はGeomanの「全体を移動」、削除は「削除する」を使用します。追加・更新・移動・削除は未保存変更として扱われます。

メモはFeatureCollectionの一部として、保存、更新保存、reload後の読込、複製、JSON書出し／読込、rollbackへそのまま含まれます。既存のMarker FeatureとJSONバックアップも引き続き読み込めます。

## 非搭載機能

- 保存済み地図の削除
- 自動保存
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

地図メモにも個人名、電話番号、正確な自宅住所、勤務先などを入力しないでください。

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

## PNG画像・PDF保存

顧客・案件の地図にある「PNG画像を保存」は、クリック時点の地図の表示範囲とzoomを画像化します。OpenStreetMap、表示中のハザードタイル、Circle、Line、Polygon、Markerの地図メモ、地図内の出典を含みます。サイドパネル、zoom・Geoman操作ボタン、編集頂点、選択中表示、画面ステータスは画像へ含めません。

PNGのファイル名は次の形式です。Windowsで使えない記号、連続する空白、長すぎる入力は書き出し時だけ安全な形へ整えます。入力値や保存recordは変更しません。

```text
mahoroba-map_<顧客コード>_<案件名>_<地図名>_<YYYYMMDD-HHmm>.png
```

「PDFとして保存」は新しい印刷用画面を開きます。現在の地図画像、匿名メタデータ、図形件数、表示中のハザード名、現地確認の注意、出典をA4横1ページ向けに構成します。ブラウザの印刷画面で保存先に「PDFに保存」を選択してください。アプリがPDFファイルを直接生成する方式ではありません。

地図のcanvas化には固定versionの`html2canvas 1.4.1`（MIT License）を使用します。ブラウザ内だけで画像を生成し、画像や入力値をserverへ送信しません。メモとmetadataは引き続きDOMの`textContent`で扱い、HTMLやscriptとして実行しません。

外部タイルはCORSを許可した画像として読み込みます。表示領域内の地図・ハザードタイルが未読込、通信失敗、提供元に存在しない場合は、欠けた画像を成功扱いで保存せずエラーを表示します。通信状態や表示位置を確認して再実行してください。外部タイル提供元の仕様変更、ブラウザのcanvas・印刷実装、端末のメモリ上限によって書き出せない場合があります。大きな画面では画像の総pixel数を制限し、ブラウザの過度なメモリ消費を防ぎます。

Chrome／Edgeの現行版を主な確認対象とします。GitHub Pagesのrepository subpathで動くよう、追加した製品assetは相対パスで参照します。公開ページでもタイルの読込完了後に実行してください。PNG／PDF操作はFeatureCollection、IndexedDB schema、schemaVersion、保存済みJSONを変更しません。

実顧客情報を入力しないルールは書き出し時も同じです。出力ファイルには画面上の地図、メモ、入力中の匿名メタデータが含まれるため、保管場所と共有相手を確認し、不要になったファイルは利用者自身で安全に削除してください。

## 区域区分レイヤー

「都市計画情報を重ねる」の「区域区分」をONにすると、愛知県の市街化区域、市街化調整区域、非線引き都市計画区域を表示します。初期状態はOFFです。区域ポリゴンはベースマップより上、利用者が作成したMarker、Circle、Line、Polygonより下の専用paneへ描画します。区域クリックは地図クリックへ伝播せず、意図しないCircleを追加しません。

- 市街化区域：ピンク系、実線境界
- 市街化調整区域：緑系、破線境界
- 非線引き都市計画区域：黄土色、点線境界
- 未確認：グレー系

ON時だけ地図右下へ凡例を表示します。区域をクリックまたはタップすると、取得できる範囲で区域区分、都市計画区域名、市区町村、基準年度、出典を表示します。欠損項目は`undefined`や`null`として表示せず、項目自体を省略します。

製品画面は国交省APIを直接呼びません。開発環境でXKT001を取得・正規化し、次の静的GeoJSONを配信します。

```text
journey-map/data/urban-area-classification/aichi.geojson
```

生成手順、properties schema、簡略化、出典と利用上の制約は[data/urban-area-classification/README.md](./data/urban-area-classification/README.md)を参照してください。GeoJSONが未配置・不正・取得不能の場合は、レイヤーを安全にOFFへ戻し、既存の地図操作を継続します。

この表示は参考情報です。建築可否、開発許可、都市計画上の正式な区域は、各自治体の担当窓口で必ず確認してください。無色部分は都市計画区域外とは限らず、データ未収録の可能性があります。

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

# map-circles

`map-circles` は、候補地点の距離圏とハザード情報を同じ地図上で確認する静的Webツールです。

責務分離PRでは、UI・文言・データ・公開挙動を変えず、単一HTMLに内包していたCSSとJavaScriptを外部ファイルへ分割しました。build工程、backend、database、認証はありません。

## ファイル構成と責務

```text
map-circles/
├─ index.html
├─ styles/
│  ├─ tokens.css
│  ├─ layout.css
│  └─ components.css
└─ js/
   ├─ config.js
   ├─ map.js
   ├─ circles.js
   ├─ ui.js
   ├─ geocoder.js
   ├─ hazards.js
   └─ app.js
```

| ファイル | 責務 |
| --- | --- |
| `index.html` | 既存markupと外部assetの相対パス読込 |
| `styles/tokens.css` | 色・背景などのCSS変数と基本reset |
| `styles/layout.css` | パネル、地図、status、PC／スマホの寸法と配置 |
| `styles/components.css` | 入力、preset、円一覧、ボタン、ハザードUIの見た目 |
| `js/config.js` | 初期半径・色とブラウザメモリ上の円状態 |
| `js/map.js` | Leaflet地図、zoom control、OSM base tileの初期化 |
| `js/circles.js` | 円とlabel markerの追加、zoom、個別削除 |
| `js/ui.js` | status、円一覧、半径preset、色選択 |
| `js/geocoder.js` | Nominatim検索の成功・0件・error処理 |
| `js/hazards.js` | 4種のハザードlayer、ON／OFF、透明度 |
| `js/app.js` | map click、全削除、パネル、初期化、inline handler公開 |

## 読み込み順

CSSは `tokens.css` → `layout.css` → `components.css` の順です。

JavaScriptはLeafletの後に、次のclassic scriptをすべて`defer`付きで読み込みます。

```text
config.js → map.js → circles.js → ui.js → geocoder.js → hazards.js → app.js
```

ES Modules、bundler、React、Vue、Vite、TypeScriptは導入していません。

既存characterization testが参照する`map`、`circles`、`hazardLayers`を維持しています。円一覧のinline handler用に`removeCircle`と`zoomToCircle`も`window`へ公開したままです。

## 現行機能

- OpenStreetMapを背景としたLeaflet地図
- 地図クリックとNominatim検索成功による円追加
- 6種類の半径preset、50m〜50,000mのカスタム半径、6色、任意ラベル
- 円へのzoom、個別削除、3秒で解除される2段階の全削除
- 洪水、土砂災害、高潮、津波ハザードと透明度変更
- PCの360pxパネルと、スマホのパネル／地図50:50レイアウト

リロードやタブ終了で配置した円は消えます。Web Storageを含む永続保存はありません。

## 外部通信先

| 目的 | 通信先 |
| --- | --- |
| Web font | `fonts.googleapis.com`、`fonts.gstatic.com` |
| Leaflet CSS／JavaScript | `cdnjs.cloudflare.com` |
| 背景地図 | `tile.openstreetmap.org` |
| 地名検索 | `nominatim.openstreetmap.org` |
| ハザードタイル | `disaportaldata.gsi.go.jp` |

Playwright testではすべてローカルmockし、ライブAPIや外部タイルへ通信しません。CDN依存や外部URLは本PRで変更していません。

## GitHub Pages互換性

想定pathは次です。

```text
/mahoroba-reports/map-circles/
```

製品assetは`./styles/...`と`./js/...`の相対パスで読み込みます。repository名を欠く`/map-circles/...`のようなroot絶対パスは使用しません。ローカルtest serverも同じPages配下pathで配信します。

## 顧客データとNominatimの禁止事項

検索してよい対象：

- 駅名
- 市区町村
- 町名
- 公共施設
- 商業施設
- 公開されている会社、学校、店舗

検索してはいけない対象：

- 顧客の正確な自宅住所
- 顧客家族の住所
- 非公開の勤務先情報
- 顧客氏名を含む検索

現行UIでは、これらの入力を技術的には遮断していません。上記は利用時に必ず守る運用ルールです。

- 個人情報をコード、fixture、console、test artifact、公開repositoryへ入れません。
- fixtureとtest入力は「架空中央駅」「架空市」など完全な架空データだけを使用します。
- PII guardは製品HTML／CSS／JavaScriptとtest source／fixtureを検査します。

## 将来の管理関係

```text
household 1 ── n journey 1 ── n mapProject
```

### Household

```js
{
  id: "UUID",
  displayCode: "HH-001",
  createdAt,
  updatedAt
}
```

氏名、住所、勤務先フィールドは持たせません。

### Journey

Journeyは、1世帯が持つ1つの目的・案件進行単位です。

v0.3 Pilotでは`land_purchase`のみを対象とします。

```js
{
  id: "UUID",
  householdId: "UUID",
  serviceType: "land_purchase",
  displayLabel: "検討1",
  status: "active | paused | closed",
  createdAt,
  updatedAt
}
```

細かい営業フェーズ分類は今回追加しません。上記データモデルの実装は工程上のPR3以降で予定しており、本PRでは記録のみです。

## 未実装・次Gate以降

次は未実装です。

- `household`、`journey`、`mapProject`の実装と永続化
- IndexedDB、localStorage、保存、import／export、undo／redo
- GeoJSON、Leaflet-Geoman、Turf.js
- Nominatim入力制限UI、既知のアクセシビリティ改善
- CDN自己配信、bundler、framework移行

## 既知の問題

- スマホは操作パネルと地図が50:50です。
- 通常操作から全画面地図へ切り替えにくい状態です。
- 色swatch、touch target、入力label、slider名、`aria-live`に既知の不足があります。
- 配置後に円の中心、半径、色、ラベルを再編集できません。

本PRではこれらを修正していません。

## Test

```text
npm ci
npx playwright install chromium
npm run test:map-circles
```

Windows PowerShellでは必要に応じて`npm.cmd`と`npx.cmd`を使用します。テストは製品asset manifest、Pages相対パス、外部通信mock、PC／スマホ寸法、主要操作、PII guardを検証します。

Pull Request更新時とmainへのpush時はGitHub Actionsでも同じtestを実行します。CIはrepositoryの読取権限だけを使用し、secretsや実顧客データを使用しません。

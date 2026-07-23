# map-circles

`map-circles` は、候補地点の距離圏とハザード情報を同じ地図上で確認する静的Webツールです。

PR1（G1）では製品コードを変更せず、現在の挙動をcharacterization testで固定します。HTML／CSS／JavaScriptの分割、UI変更、Leaflet-Geoman、Turf.js、GeoJSON、IndexedDBなどは対象外です。

## 現行機能

- OpenStreetMapを背景としたLeaflet地図
- 地図クリックによる円追加
- 住所・地名検索成功後の円追加
- 500m、800m、1km、2km、3km、5kmの半径preset
- 50mから50,000mまでのカスタム半径
- 6色と任意ラベル
- 円へのズーム、個別削除、2段階の全削除
- 洪水、土砂災害、高潮、津波ハザードの重ね合わせ
- ハザードレイヤーの透明度変更

## 現行アーキテクチャ

- `index.html` 1ファイルにHTML、CSS、JavaScriptを内包しています。
- Leafletのcircle・markerオブジェクトと画面状態をブラウザメモリ上の配列で管理しています。
- build工程、backend、database、認証はありません。
- リロードやタブ終了で配置した円は消えます。永続保存はありません。

## 外部通信先

| 目的 | 通信先 |
| --- | --- |
| Web font | `fonts.googleapis.com`、`fonts.gstatic.com` |
| Leaflet CSS／JavaScript | `cdnjs.cloudflare.com` |
| 背景地図 | `tile.openstreetmap.org` |
| 地名検索 | `nominatim.openstreetmap.org` |
| ハザードタイル | `disaportaldata.gsi.go.jp` |

Playwright testでは、これらをすべてローカルmockし、ライブの検索APIや外部タイルへリクエストしません。

## Nominatim検索ルール

検索してよいもの：

- 駅名
- 市区町村、町名
- 公共施設、商業施設
- 公開されている会社、学校、店舗

入力してはいけないもの：

- 顧客の正確な自宅住所
- 顧客家族の住所
- 非公開の勤務先情報
- 顧客氏名を含む検索

現行の検索機能自体はPR1では変更しません。

## 顧客データの禁止

- 氏名、住所、勤務先などの個人情報をコード、fixture、console出力、test artifact、公開リポジトリへ入れません。
- fixtureは「架空中央駅」「架空市」など、完全な架空データだけを使用します。
- testの失敗メッセージやtraceへ検索入力が残り得るため、testでも実データを使用しません。

## GitHub Pages互換性

このrepositoryはproject siteとして配信されるため、想定URLは次です。

```text
/mahoroba-reports/map-circles/
```

将来ファイルを分割する場合も、`./styles/app.css` や `./js/app.js` のような相対パスを使用します。`/map-circles/...` のようなrepository名を欠くroot絶対パスは使用しません。

PR1は`index.html`を変更しないため、既存公開ページの製品挙動とasset参照は変わりません。

## 既知の問題

- スマホでは操作パネルと地図が50:50の高さです。
- パネル開閉ボタンは、パネルが閉じた状態でしか表示されないため、通常操作から全画面地図へ切り替えられません。
- 色swatchがbuttonではなく、キーボード操作やアクセシブルネームに対応していません。
- 一部のbutton、swatch、checkboxが推奨されるtouch targetより小さい状態です。
- 入力欄の明示的label、sliderのアクセシブルネーム、status通知の`aria-live`が不足しています。
- 円の中心、半径、色、ラベルを配置後に再編集できません。

PR1ではこれらを修正せず、responsive baselineと既知の制約として記録します。

## 将来の管理構造

v0.3 Pilotでは、管理単位を次の関係にします。

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

Journeyは、1世帯が持つ1つの目的・案件進行単位です。v0.3 Pilotでは`land_purchase`だけを対象にします。

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

細かい営業フェーズ分類は追加しません。PR1では、このデータモデルや保存機能を実装しません。

## Test

```powershell
npm.cmd install
npx.cmd playwright install chromium
npm.cmd run test:map-circles
```

testは`/mahoroba-reports/map-circles/`をローカル配信し、外部通信をmockしたChromiumで実行します。

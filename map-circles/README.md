# まほろば距離円マップ

`map-circles`は、候補地点からの距離圏を素早く複数描くための軽量な静的Webアプリです。製品挙動はcommit `46ce1563957606439d0bae300771f68b1a6d01d9`のcharacterization baselineを基準にしています。

## 目的

地図上で複数の候補地点と半径をすばやく比較し、距離感とハザード情報を初期検討に使えるようにします。

## 想定利用場面

- 候補駅や公開施設を中心とした距離圏の比較
- 複数候補地の概略的な到達範囲の確認
- 洪水、土砂災害、高潮、津波ハザードとの重ね合わせ

## 搭載機能

- 地図クリックによる円追加
- 住所、駅名、地名検索による円追加
- 500m、800m、1km、2km、3km、5kmの半径preset
- 50mから50,000mまでのカスタム半径
- 円の色と任意ラベル
- 円へのズーム
- 円の個別削除と2段階の全削除
- 4種類のハザード表示と透明度変更

## 非搭載機能

- Marker、Line、Polygonの描画・編集
- 描画後の円の移動・形状編集
- GeoJSON同期とMemory Store
- 永続保存、IndexedDB、localStorage
- import、export、undo、redo
- 認証、backend、外部database

## 起動URL

Repository rootでローカルサーバーを起動します。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

ローカルURL：

```text
http://127.0.0.1:8000/map-circles/
```

公開予定URL：

```text
https://nowwest21works-tech.github.io/mahoroba-reports/map-circles/
```

## 個人情報と保存

- 顧客氏名、正確な自宅住所、家族の住所、非公開の勤務先情報を入力しないでください。
- 検索には駅名、市区町村、町名、公開施設などを使用してください。
- 配置した円はブラウザメモリだけに保持されます。
- リロード、タブ終了、ブラウザ終了で配置内容は消えます。

## まほろば顧客条件マップとの違い

この軽量版はCircleだけをすばやく複数描く用途に限定しています。Marker、Line、Polygon、編集、移動、GeoJSON同期、Memory Store、rollbackが必要な場合は`journey-map`の「まほろば顧客条件マップ」を使用します。

## Test

```powershell
npm.cmd run test:map-circles
```

PlaywrightはGitHub Pages配下path、円操作、検索、ハザード、PC／360px表示、console error、page error、PII guard、外部通信mockを確認します。

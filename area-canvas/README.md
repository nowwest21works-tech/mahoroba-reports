# まほろば白地図キャンバス（Area Canvas）v0.1

`journey-map`（顧客条件マップ）の派生版です。既存の詳細版は変更せず、そのまま保持しています。
Marker/Circle/Line/Polygon描画、地図メモ、IndexedDB保存、JSONバックアップ、住所検索、
市街化区域・市街化調整区域レイヤーは`journey-map`のコードをそのまま流用しています。

## journey-mapとの違い（このバージョンで追加したもの）

### 1. 表示モード（MapModeSwitcher）

背景の実写地図（OpenStreetMap）はデータソースを切り替えるのではなく、
**同じタイルの不透明度を下げ、CSSでモノトーン化**することで「白地図」の印象を作ります。

- 通常地図：場所の確認用。背景をそのまま表示
- 白地図：顧客提示用。背景を薄くモノトーン化し、行政界・鉄道・道路のベクター線と
  手書き注釈（Marker/Circle/Line/Polygon・付箋）を目立たせる
- 路線重視 / 車移動重視：白地図＋対応するレイヤーだけをONにするワンタップの組み合わせ
- 不透明度スライダー・モノトーン切替は個別にも調整可能

### 2. 地理データレイヤー（MapLayerToggle）

行政界・鉄道・道路を個別にON/OFFできます。データは国土数値情報（国交省）から
生成した静的GeoJSONを使い、**未生成・不正・取得不能の場合は安全にOFFのまま留まり、
形状を推測表示することはありません**（`data/README.md`参照）。

Public版は行政界・鉄道・道路の3レイヤーを配布します。W05河川は公式利用条件が非商用のため、
生成物をGitへ含めず、Internal / Local QAでのみ`?internalData=1`を付けて利用します。
対象版、取得元、schema、geometry監査は`data/README.md`を参照してください。

### 3. 道路名ラベル（手動登録）

国土数値情報の道路データには路線名（国道◯号等）の属性が無いため、
`data/road/route-labels.json`へ現地確認済みの地点だけ手動登録します（①の決定）。
未登録の間はラベルを表示しません。

### 4. エリアプリセット（AreaPresetSelector）

愛知県全域／名古屋市／尾張／知多／西三河への表示範囲移動ボタンです。
現時点では目安のバウンディングボックスで、行政界データ生成後は実データから
算出した範囲に置き換えることを推奨します。

## v0.1 Pilotのスコープ外（意図的に含めていないもの）

- PNG/PDF出力の新規UI導線（`journey-map`のコードは残していますが、Pilotではまず
  iPad標準スクリーンショットでの運用を検証する方針のため、v0.1では前面に出していません）
- 付箋型テキストボックスへの地図メモ拡張（複数行・ドラッグ・リサイズ・背景色・半透明等は
  次フェーズ）
- ハザード・市街化区域レイヤーの本格統合（`journey-map`から流用済みのコードはそのまま
  動きますが、Phase 2候補として位置づけています）

## ローカル起動

repository rootでHTTP serverを起動します（`journey-map`と同様、`file://`直接オープンは不可）。

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

```text
http://127.0.0.1:8000/area-canvas/
```

W05を生成済みの内部検証環境に限り、次のURLで河川checkboxを有効化します。

```text
http://127.0.0.1:8000/area-canvas/?internalData=1
```

## データ生成

`data/README.md`を参照してください。Public用3レイヤーは`npm run data:area-canvas:public`、
W05を含む内部QA用は`npm run data:area-canvas`で生成します。

## 保存方式

`journey-map`と同一ブラウザで両方使う場合の保存衝突を避けるため、IndexedDBのDB名を
`mahorobaAreaCanvas`に変更しています（`journey-map`は`mahorobaJourneyMaps`）。
その他の保存仕様（schemaVersion、匿名メタデータ、個人情報を入力しないルール等）は
`journey-map/README.md`と同じです。

## Human Gate（今西さんの確認が必要な境界）

- 既存詳細版（`journey-map`）の構造を変える場合
- main反映 / GitHub Pages公開更新
- 地理データの正本差替え（dataset版・取得元・filter条件の変更）
- 顧客実利用開始

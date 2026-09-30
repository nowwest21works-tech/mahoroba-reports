# まほろば白地図キャンバス（Area Canvas）v0.1

## Collapsible Research Panel / Deep Time Map v0.1

左パネルは9つの独立した開閉式です。初回は半径、色とラベル、地図メモ、配置した円、顧客・案件の地図を開き、場所検索、表示モード、地理データ、使い方ヒントを閉じます。複数の分野を同時に開けます。開閉設定は `mahorobaAreaCanvas.panelSections.v1` としてブラウザの `localStorage` に保存し、案件データには含めません。旧形式・破損値・利用不可時は新しい初期設定で利用できます。

Deep Time Map には現在／縄文海進期／最終氷期の排他的な時代選択、5つの補助レイヤー、不透明度を設けました。v0.1 の全 dataset は **データ未接続** です。ON にしても過去地形は描画せず、未接続の補助レイヤーは選択できません。manifest は `data/deep-time/manifest.json`、出典・公開条件の方針は `data/deep-time/README.md` を参照してください。

### Public Research Layer Pack 01（Pilot）

3つの公式ラスタータイルを、Deep Timeとは別の小さなRegistryから読み込みます。定義は `data/research-layers/manifest.json`、検証は `js/research-layers-domain.js`、Leaflet接続と操作状態は `js/research-layers.js` が担当します。対象は治水地形分類図、明治期の低湿地、20万分の1日本シームレス地質図V2です。都市圏活断層図は準備中表示のみで、タイルを読み込みません。3件のAuthorityは `EVIDENCE` 候補として記録しています。

manifestが不正・取得不能、対応zoom外、タイル読込失敗の場合は描画しません。提供範囲外や透明タイルの意味を推定せず、「表示できません／未確認」として扱います。レイヤー状態は案件データやIndexedDBへ保存せず、再読込時はOFFに戻ります。不透明度は3レイヤー共通で、初期値は65%です。GSJ地質図の地点別凡例照会は共通「この地点を調べる」から公式APIへ問い合わせます。治水地形分類図ラスタと明治期低湿地は凡例・出典表示のみです。

既知の制約：Terrain Identifyの公式コード対応表はPilot範囲で、未対応コードの名称や説明は表示しません。明治期低湿地のIdentifyは未実装です。Playwright E2Eは実行環境にCLI依存がなく未実行です。また、tile状態の集計にLeaflet内部の表示tile情報を一部参照しており、Leaflet更新時に回帰確認が必要です。

PNG/PDF出力ではPublic Research Layerを意図的に画像から除外し、画像と出力状態に除外情報を示します。公式URLへの実接続、CORS、外部サービスの稼働・レート制限、最終的な利用条件の判断は、このローカルPilotのテスト範囲外です。公式出典リンクは各レイヤーの「情報・出典」に表示します。

### Public Research Layer Pack 02（Pilot）

Pack 01のRegistryに、地理院タイルの陰影起伏図・色別標高図・傾斜量図と、中部圏の宅地利用動向調査（1977/1982/1987/1991/1997）を追加しました。宅地利用は単一の年代選択で一度に1時点だけ表示します。いずれも出典・利用条件リンクと注意書きをカード内に示し、Research Layer共通の不透明度を使用します。時点データは過去の土地利用資料であり、現在の土地利用を示しません。

共通「この地点を調べる」では、GSJ地質APIに加えて地理院DEMタイルから標高を照会します。DEMは公式PNG符号化仕様を使用し、地点に応じて利用可能な解像度を順に試します。標高値には原典の種類・解像度を表示し、上位解像度が欠けるなど一部候補で問題があった場合は注意を付けます。NoDataや取得失敗時に値を補完しません。地理院の公式タイル一覧・標高タイル仕様を各カードおよび出典リンクから確認してください。

Pack 02でもResearch Layerは案件データやIndexedDBへ保存せず、再読込時はOFFに戻ります。PNG/PDF出力から除外する方針と、タイル状態集計にLeaflet内部情報を一部参照する制約はPack 01から継続します。年代ごとのタイル網羅性、実通信時のCORS・外部サービス稼働、各地点におけるDEM候補の実在は一定ではありません。宅地利用の地点Identifyは未実装で、公式凡例への導線を提供します。Playwright E2Eは環境にCLI依存がなく未実行です。

将来の dataset 分類は `EVIDENCE`（観測・解析）、`RECONSTRUCTION`（根拠に基づく推定復元）、`ILLUSTRATION`（理解補助）です。現在の全件は分類未確定です。原典、利用条件、公開可否を確認して Human Gate を通過するまでデータ接続しません。将来は年代別復元、地下構造・地質等を段階的に接続する予定です。

Deep Time 用 pane は 305（時代）と 310（補助情報）で、既存の地理線（315〜340）と都市計画情報（350）、ユーザー注釈より下に置きます。現時点で Deep Time geometry はないため PNG/PDF 出力にも含まれません。将来データ接続時には既存 exporter のベクター描画・CORS・帰属表記を確認する必要があります。

`journey-map`（顧客条件マップ）の派生版です。既存の詳細版は変更せず、そのまま保持しています。
Marker/Circle/Line/Polygon描画、地図メモ、IndexedDB保存、JSONバックアップ、住所検索、
市街化区域・市街化調整区域レイヤーは`journey-map`のコードをそのまま流用しています。

## journey-mapとの違い（このバージョンで追加したもの）

### 1. 表示モード（MapModeSwitcher）

背景地図は地理院淡色が標準です。表示モード内でOpenStreetMap（任意）へ切り替えられます。背景タイルの不透明度を下げ、CSSでモノトーン化して「白地図」の印象を作ります。

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

## 初期 Pilot 以降の機能と未対応事項

- PNG/PDF出力のUI導線は現在の Area Canvas にあります。Deep Time geometry は未接続のため出力対象にはありません。
- 付箋型テキストボックスへの地図メモ拡張（複数行・ドラッグ・リサイズ・背景色・半透明等は
  次フェーズ）
- ハザード・市街化区域レイヤーのUI導線は現在の Area Canvas にあります。

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

## Decision Inspector v0.1

「地理データを重ねる」内の「この地点を調べる」をONにし、地点をクリックすると、座標、地形分類、DEM標高・種別・元データ、地質、各取得Status、現在の表示Context、出典、注意事項を同じInspectorへ集約します。9つのTop-level Sectionは維持します。地質照会は従来どおり地質図ON時のみで、OFF時は未照会のUNAVAILABLEです。

Statusは資料の取得状態です。全項目取得はREADY、一部取得・未照会・欠測の混在はPARTIAL、全項目取得不能はUNAVAILABLE、全項目値なしはNO_DATAです。地形のNO_FEATUREはInspectorではNO_DATAに統一し、原典の返却値は変更しません。未知の地質応答はUNAVAILABLEとし、NoDataに推測で変換しません。

Research Layerの選択・表示状態、宅地利用年代（OFF時も選択値を明記）、ハザードの選択、都市計画の表示状態、Deep Timeの選択時代・未接続状態は現在の操作に追従します。Contextは地点Evidenceではなく、ハザードの取得状態・地点該当、都市計画の地点区域、宅地利用の地点分類は判定しません。DEMは既存の公式符号化仕様で照会し、表示色の意味解析は行いません。

連続クリックでは最新地点だけを採用し、OFF後の遅延応答は表示しません。案件保存・DB・dataset・外部APIの追加はありません。外部通信のCORS・実地点での応答、画面操作はHuman Browser Reviewで確認してください。

## Hazard Identify Pilot 01｜Flood（Local）

Decision InspectorにXKT026の公式Vector Evidenceを追加しました。洪水Rasterとは独立して地点照会し、全該当Featureの河川・管理者・公式浸水深ランク・年度根拠・Status・出典を表示します。API KeyはPython proxyの環境変数だけを使用します。通常のStatic ServerではFloodはUNAVAILABLEです。起動・仕様・制約・QA証拠は [Local Pilot手順](docs/hazard-identify-flood-pilot.md) を参照してください。Deep Time・公開設定・DBには変更ありません。

## Hazard Identify Coastal Pilot 01（Local）

Decision Inspectorに公式XKT027（高潮）・XKT028（津波）のVector Evidenceを追加しました。Rasterとは独立照会し、Status・該当件数・浸水深を常時表示、詳細とEvidence・出典・注意事項は折りたたみます。浸水深は各APIの文字列を保持し、Floodのランク表で変換しません。起動・公式Schema・Fail Closed・Human Browser確認は [Coastal Pilot手順](docs/hazard-identify-coastal-pilot.md) を参照してください。土砂災害の地点Identifyは未実装です。

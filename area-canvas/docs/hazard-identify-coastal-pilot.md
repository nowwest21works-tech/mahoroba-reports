# Hazard Identify Coastal Pilot 01（Local）

## 公式仕様の確認（2026-09-30）

| 項目 | 高潮 | 津波 |
| --- | --- | --- |
| API | XKT027 | XKT028 |
| 固定endpoint | https://www.reinfolib.mlit.go.jp/ex-api/external/XKT027 | https://www.reinfolib.mlit.go.jp/ex-api/external/XKT028 |
| response_format | geojson | geojson |
| XYZ zoom | 13–15（画面照会は14） | 14–15（画面照会は14） |
| 都道府県名 / コード | A49_001 / A49_002（string） | A40_001 / A40_002（string） |
| 浸水深区分 | A49_003（string） | A40_003（string） |
| 対象年 | target_year（integer） | target_year（integer） |

公式API仕様：[XKT027](https://www.reinfolib.mlit.go.jp/help/apiManual/xkt027/) / [XKT028](https://www.reinfolib.mlit.go.jp/help/apiManual/xkt028/)。
原典：[高潮 A49 2024](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A49-2024.html) / [津波 A40 2024](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A40-2024.html)。
[API一覧](https://www.reinfolib.mlit.go.jp/help/apiManual/)のデータ基準年度は両方2024年度。Featureのtarget_yearとは区別する。
空tileのHTTP 200 / 空配列は公式No Data応答として扱う。

浸水深はFloodの整数ランクではなく原典の文字列。数値コードを深さに変換しない。
単位・数値・範囲表記を確認できない値は未確認 / PARTIALとし、原文をEvidenceに残す。
公式資料は実際の高潮・津波が想定を超える可能性を明記する。原典の位置精度、都道府県ごとの利用条件にも留意する。

## 起動とHuman Browser確認

既存Flood用proxyを停止してから、このworktree rootで再起動する。既存の環境変数REINFOLIB_API_KEYを使う。キー値をコマンド、URL、ログ、ファイルへ書かない。

```powershell
python scripts/area-canvas-local-proxy.py --port 8000
```

http://127.0.0.1:8000/area-canvas/ を開く（localhostや公開hostnameは対象外）。
通常のStatic Serverでは公式VectorはUNAVAILABLE。

1. 「地理データを重ねる」→「この地点を調べる」をON。Flood・高潮・津波RasterをOFFのまま地点クリック。
2. 高潮・津波のStatus、該当件数、全Featureの浸水深原文を常時表示で確認。
3. 「詳細」「Evidence・出典・注意事項」は初期状態で閉じること、開くと都道府県・対象年・正式属性・出典が読めることを確認。
4. 固定QA地点35.1, 136.885付近ではlive確認時に高潮READY / 1件 / 3m以上5m未満、津波PARTIAL / 1件 / 0.01m以上 ～ 0.3m未満。両方target_yearは2022。クリック座標や公式データ更新で結果は変わり得る。
5. 津波の上記tileにはgeometry検証を通らないFeatureが1件あり、PARTIALと完全性未確認を保持。検証を緩めてREADYにしない。
6. 該当Polygonがない地点ではNO_DATAの説明と「浸水しないことを意味しません」を確認。通信失敗・キー未設定ではUNAVAILABLE。
7. 連続クリックで最新地点だけを表示、OFFで表示解除とabort、同tile再照会でcacheが機能することを確認。既存Floodと地形・DEM・地質・Contextの操作も確認。

## 構造・境界

Browser → 同一originのLocal Python Proxy → 公式API → GeoJSON → 既存FloodのPolygon/MultiPolygon・hole検証 → Decision Inspector。
固定providerはFlood、storm-surge、tsunamiの3つ。最小のdomain adapterでFloodのcache / abort処理を再利用し、cacheは各providerで独立。
proxyは上流要求を直列化し0.5秒以上間隔を置く。任意URL・任意providerは受け付けない。

API Keyはproxyのプロセス環境変数のみ。公式APIへheaderで送信し、Browserへ渡さない。
127.0.0.1限定、Host / Origin検証、CORSなし、ログなし、redirect拒否、属性allowlist、応答サイズ制限、キー反射拒否を維持。
上流応答をファイルへ保存しない。ブラウザ・proxyのtile cacheはメモリのみ。

全該当Featureを個別保持。境界・未知属性・不正Feature混在はPARTIAL、検証不能はUNAVAILABLE。
正常に照会・検証した資料で該当Polygonがない場合のみNO_DATA。安全・危険・リスクスコア・購入推奨を判定しない。
Raster pixel判定、AI推定、未知code変換、推定geometryは行わない。
土砂災害は未実装。9 Top-level Section、Deep Time、DB、package、lockfile、Actions、公開設定を変更しない。

## QA

新規domain testsは各providerのhit / miss / MultiPolygon / hole / 複数Feature / unknown属性 / malformed応答 / Status / latest click / cache / abortを確認。
Python proxy testsは既存Floodを維持し、providerごとのschema・zoom・接続・cache分離・Host / Origin・エラーの秘匿を確認。
Live結果はAPIとdomainの接続確認であり、Human Browser Reviewを代替しない。
Coastalは実装・QA・diff reviewまで。commit / push / merge / Production publishは未承認。

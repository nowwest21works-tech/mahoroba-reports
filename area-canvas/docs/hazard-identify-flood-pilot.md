# Hazard Identify Pilot 01｜Flood

Local Pilotのみ。Rasterの面表示は変更せず、Decision InspectorへXKT026 Vectorの地点Evidenceを追加します。9 Section、DB、Deep Time、package/lockfile、公開設定は変更しません。

## 公式仕様確認（2026-09-30）

- [XKT026公式API仕様](https://www.reinfolib.mlit.go.jp/help/apiManual/xkt026/)：`response_format=geojson`、XYZ zoom 14〜15、A31a_201〜205。河川番号・河川名・河川管理番号・河川管理者・浸水深ランクのみを使用します。API上でPolygonを分割提供する場合があります。
- [公開API一覧・Q&A](https://www.reinfolib.mlit.go.jp/help/apiManual/)：XKT026の出典は河川単位の令和6年度（2024年度）版。値なしtileはHTTP 200で空配列と説明されています。年度はAPI一覧の表記を表示し、個別河川の指定年度には読み替えません。API応答に年度属性は定義されていません。
- [原典データ（2024年度）](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A31a-2024.html)：原典・精度・留意事項。公開APIの年度を、原典サイトの最新年度へ勝手に変更しません。
- [公式浸水深ランクコード](https://nlftp.mlit.go.jp/ksj/gml/codelist/water_depth_code.xlsx)：1=0～0.5m未満、2=0.5～3.0m未満、3=3.0～5.0m未満、4=5.0～10.0m未満、5=10.0～20.0m未満、6=20.0m以上。公式区分だけを表示し、住宅への影響やリスク評価は追加しません。

## Provider / Proxy

Browser → same-origin `/api/flood?z=14&x=…&y=…` → 127.0.0.1 Python Proxy → fixed XKT026 HTTPS endpoint → GeoJSON → Point-in-Polygon → Inspector。

洪水RasterのON/OFFと独立して、「この地点を調べる」中の地点クリックで照会します。通常のStatic ServerではproxyがないためFloodはUNAVAILABLEになります。Public hostではProviderが照会しません。

Python標準ライブラリだけでStatic Serverとproxyを統合します。Static配信はarea-canvas内の許可拡張子だけで、directory listing・dotfile・repo外pathを拒否します。Hostは127.0.0.1＋使用port、Originは同じoriginだけ許可します。cross-site fetch・CORS・汎用URL proxy・redirect転送は許可しません。

Keyはプロセス環境変数 `REINFOLIB_API_KEY` だけから読み、上流HTTP headerだけに使用します。.env、URL、JS、fixture、log、応答、file、cacheへKeyを保存しません。起動時は存在有無だけを表示します。上流の例外詳細・raw応答はログに出しません。APIからの応答はgeometryと公式5属性だけへ絞り、Key反射があれば拒否します。

同一tileはbrowser/proxyのメモリcache（最大16tile、5分）を利用し、保存・DB化しません。browserは同一tileのin-flight requestを共有し、別tileまたはInspector OFFでAbortします。Inspectorのrequest versionが古い地点の応答を排除します。proxyで既に開始済みの上流urllib通信はbrowser Abortで中断できません（20秒timeout）。上流照会は直列、最低0.5秒間隔です。自動再試行はしません。

## Fail Closed

- 有効な全Featureを照合し、重複河川・分割Featureは全件保持します。統合やdeduplicateはしません。
- PolygonとMultiPolygon、holeを扱います。境界に当たる場合はPARTIALと注意を表示し、敷地内外を確定しません。
- 空FeatureCollection、公式の空配列、有効geometryで全件missはNO_DATA。浸水しないことを意味しません。
- API失敗、proxy不在、Keyなし、形式不正、全件不正geometryはUNAVAILABLE。
- 有効なhitと不正Featureの混在、公式属性欠測、未知のdepth rankはPARTIAL。未知コードの名称・深さは補完しません。
- 不正Featureがありhitなしの場合はUNAVAILABLEにし、完全なNo Hitとは扱いません。
- Raster色・AI推定・geometry推定・安全/危険/購入推奨・リスクスコアは使用しません。

## 起動とHuman Browser確認

既存のhttp.serverが同じportを使用していれば、操作者がそのserverを終了するか別portを選択してください。既存processを自動停止しません。

Area Canvas worktreeで、Keyを安全なプロセス環境変数へ設定したshellから起動します。Keyをコマンド引数やrepo fileへ書かないでください。

```powershell
python scripts/area-canvas-local-proxy.py --port 8000
```

`python`がPATHにない場合はインストール済みPythonの絶対パスを使用します。追加package不要です。

1. `http://127.0.0.1:8000/area-canvas/` を開き、「地理データを重ねる」→「この地点を調べる」をON。
2. 洪水Raster OFFで地点をクリックし、地形・標高・地質の後に洪水Evidence、Status、出典が出ることを確認。
3. Raster ON/OFFでVector結果が変わらず、表示Contextだけが追従することを確認。
4. 連続クリック、同一tile再クリック、照会中OFFを試し、最後の地点だけ表示されることを確認。
5. networkのbrowser requestは同じoriginの `/api/flood` で、Key付きheader・URLがないことを確認。
6. proxyなしのStatic ServerやKeyなし環境ではUNAVAILABLEとなり、NO_DATAや安全表示にならないことを確認。
7. PCとmobileで座標→Evidence→Context→出典→注意事項の読みやすさ、9 Section、既存円・描画・保存を確認。

## Live QA証拠

2026-09-30、固定の公開QA座標（緯度35.168、経度136.8815）で、環境変数をheaderだけに用いたXKT026 live照会と製品Domainによる判定を実行しました。tile内2861 Feature、不正0、hit3、Status READY。香流川（愛知県）、庄内川（中部地方整備局）、矢田川（中部地方整備局）がそれぞれ公式ランク2でした。顧客地点ではありません。raw応答・Keyは保存していません。これはこの照会の証拠であり、実ブラウザのVisual Reviewや災害リスク判断の代わりにはなりません。

## Production前の未解決事項

Production Provider・認証・secret管理・アクセス制限・運用cacheは今回の対象外です。API規約・原典の利用条件・出典credit・年度更新手順・分割geometryの境界精度・実サービス負荷/障害運用を改めて確認する必要があります。local API Keyの存在をProduction利用承認とは扱いません。main merge、公開設定、Production deployは行いません。

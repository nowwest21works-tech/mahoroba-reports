# Hazard Identify Landslide Pilot 01（Local）

## 公式Evidence（2026-09-30確認）

- [XKT029公式仕様](https://www.reinfolib.mlit.go.jp/help/apiManual/xkt029/)
- endpoint: https://www.reinfolib.mlit.go.jp/ex-api/external/XKT029
- response_format=geojson、XYZ zoom 11–15（画面照会は14）。Polygonと一部地域のLineを提供。
- [API一覧](https://www.reinfolib.mlit.go.jp/help/apiManual/)の基準年度は2024年度（令和6年度）。
- [原典 A33 2024](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33-2024.html)の基準日は2024-06-30。原典サイトには2025年度版もあるが、APIを2025年度へ推測更新しない。

| API属性 | 型・意味 |
| --- | --- |
| A33_001 | integer・現象の種類：1 急傾斜地の崩壊、2 土石流、3 地滑り |
| A33_002 | integer・区域区分：1 警戒区域指定済、2 特別警戒区域指定済、3 警戒区域指定前、4 特別警戒区域指定前 |
| A33_003 | string・都道府県コード |
| A33_004 | string・区域番号 |
| A33_005 | string・区域名 |
| A33_006 | string・所在地 |
| A33_007 | string・公示日（原典は告示日表記） |
| A33_008 | integer・特別警戒未指定フラグ：0 指定済み、1 未指定 |

公式コード出典：[現象種別](https://nlftp.mlit.go.jp/ksj/gml/codelist/CodeOfPhenomenon.html)、[区域](https://nlftp.mlit.go.jp/ksj/gml/codelist/CodeOfZone_A33.html)、[未指定フラグ](https://nlftp.mlit.go.jp/ksj/gml/codelist/CodeOfUnSpecification.html)、[都道府県](https://nlftp.mlit.go.jp/ksj/gml/codelist/PrefCd.html)。
区域コード3・4は基礎調査結果の公表を意味する「指定前」と明示する。指定済へ置換しない。
公式コードの「地滑り」はUIも同表記。API仕様にtarget_yearはないため、年度を生成しない。公示日を対象年へ変換しない。

## Data model / Fail Closed

土砂固有のphenomenon、zone、prefectureCode、areaNumber、areaName、location、noticeDate、unspecifiedと全8属性のraw値を保持。
常時表示はStatus、件数、各Featureの現象と区域区分。詳細は区域名・所在地・公示日・フラグ、Evidenceは正式属性・コード出典・基準年度・注意事項。
重複・重なりは全Featureを個別表示する。浸水深modelへ変換しない。

Polygon / MultiPolygon・hole判定は既存Floodの検証を再利用。Line / MultiLineStringは区域への補完・buffer・地点該当判定を行わない。
Lineまたは検証不能Featureがtileにある場合、hitありはPARTIAL、hitなしはUNAVAILABLE。静かにNO_DATAへ変換しない。
未知integer code・文字列型code・欠測はPARTIAL。未知コードの原値はEvidenceに残す。
正常な空配列・検証済みPolygonのmissはNO_DATA。「区域外 = 斜面災害等の危険なし」とは表示しない。
READYは取得・検証状態であり、安全・危険・リスクスコア・購入推奨ではない。

原典は概略位置の参考資料で法的図書ではなく、全区域を網羅しない。指定・解除も直ちに反映されない。正式区域は所管都道府県の公示図書等で確認する。
都道府県ごとのデータ時点・利用条件は原典リンクを参照する。

## Architecture / Secret

Browser → 同一originのLocal Python Proxy → Official XKT029 → GeoJSON → Point-in-Polygon → Decision Inspector。
Floodの既存createProviderへ土砂domainと固定/api/landslideを渡す。土砂のcache / abortは独立し、最新地点の採用は既存Inspector gateを再利用。
API Keyはproxyのプロセス環境変数REINFOLIB_API_KEYのみ。上流headerで送信し、repo・JS・HTML・URL・logには置かない。
127.0.0.1限定、Host / Origin確認、CORSなし、ログなし、固定endpoint、属性allowlist、redirect拒否、サイズ上限、secret反射拒否を維持。

## Live QA

固定地点35.18, 137.08の公式tileは空応答、NO_DATA。
固定地点35.23, 137.10のtileは31 Feature。検証不能geometryが1件あり、当該クリックはhitなし / UNAVAILABLE。
同tileの公式Polygon内で検証したQA地点35.22977833066421, 137.0891763479033は1件 / PARTIAL。
確認属性：急傾斜地の崩壊、土砂災害警戒区域（指定済）、都道府県コード23、公示日2007/08/28、特別警戒区域指定済み。
該当Featureの属性は確認済みだが、tile全体の完全性は未確認。geometry検証を緩めてREADYにしない。
QA地点の算出はテスト用のメモリ内操作のみで、製品に推定geometryを生成する機能はない。生GeoJSONやKeyをファイルへ保存しない。

## Human Browser Review

1. このworktree rootで既存proxyを停止・再起動する（端末の既存環境変数を使用、Key値をコマンドへ書かない）。

```powershell
python scripts/area-canvas-local-proxy.py --port 8000
```

2. http://127.0.0.1:8000/area-canvas/ を再読込。「地理データを重ねる」→「この地点を調べる」をON。
3. Hazard RasterをOFFのまま地点クリックし、洪水・高潮・津波・土砂の4種が同じInspectorに出ることを確認。
4. 上記QA地点の件数・現象・区域区分とPARTIAL説明を確認。クリック座標やAPI更新で結果は変わり得る。
5. 「詳細」「Evidence・出典・注意事項」が初期状態で閉じること、正式属性・コード・公示日・7出典リンクが保持されることを確認。
6. NO_DATA地点で斜面災害等の危険なしを意味しない文言、通信失敗時にUNAVAILABLEを確認。
7. 複数区域・指定前の表示は対応地点またはdomain testsで確認。連続クリックは最新地点のみ、OFFで表示解除・abort、再クリック時のcacheと既存3種の操作を確認。

Domain testsはhit / miss / MultiPolygon / hole / 境界 / 複数Feature / 全現象 / 区域区分1–4 / 未知code / malformed / Line / Status / cache / abort / latest clickを確認。
Human Browser Reviewは未実施。実装・QA・diff reviewで停止し、Landslideはcommit / pushしない。

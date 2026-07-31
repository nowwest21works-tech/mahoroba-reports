# 現在海岸線データの比較

## 結論

Web MVP の全国表示には、**Natural Earth 1:10m の Coastline と Minor Islands**
を推奨する。公開領域で取得が容易、世界全体でも配布 ZIP が合計約 3.2 MB と
小さく、全国縮尺の比較線として扱いやすい。Phase 1.5 の既存画像・GeoJSONは
置き換えず、Phase 2 で別の `DATA / current_coastline` レイヤーとして評価する。

国土地理院（GSI）の基盤地図情報は、東京湾・伊勢湾・瀬戸内海などの詳細表示を
検証する基準データの第一候補とする。OpenStreetMap（OSM）由来データは、
MVP の現在海岸線だけを得る用途には取得・ライセンス管理が相対的に重いため
第一候補にしない。

## 調査結果

| 候補 | 精度・用途 | 全国取得 | 配信容量 | ライセンス・表示 | 更新性 | GEBCO との比較 |
|---|---|---|---|---|---|---|
| 国土地理院 基盤地図情報 | 都市計画区域は概ね 1:2,500、その他は概ね 1:25,000。詳細QA向き | 全国提供。ただし利用者登録・ログイン、GML取得と変換が必要 | 全国一括では大きい。対象地域切出し・簡略化が必要 | 国土地理院コンテンツ利用規約。利用形態により測量成果の使用・複製承認確認が必要 | 公的基盤データとして更新あり | 15秒格子の GEBCO より詳細。代表地域で位置差を実測する基準候補 |
| Natural Earth 1:10m | 全国縮尺・概要表示向き。小島は Minor Islands を併用 | 世界全体を一括取得できる | Coastline 2.93 MB + Minor Islands 303 KB（配布 ZIP 表示値） | Public domain。クレジットは推奨だが必須ではない | バージョン更新型。日々の更新用途ではない | 表示縮尺が GEBCO より細かいが、精密海岸線ではない |
| OpenStreetMap | 地域によって非常に詳細。複雑な海岸線・島嶼を含む | planet / regional extract / Overpass 等の取得設計が必要 | 生データは大きい。抽出・結合・簡略化が必要 | ODbL。OpenStreetMap contributors の表示、ライセンス通知、派生DB条件の確認が必要 | 継続更新 | 詳細比較に使えるが、品質・更新時点・編集状況が地域ごとに異なる |
| GEBCO 0 m 等値線（現状） | 同一標高面から作るためモデル差分の説明は一貫 | Phase 1 入力から再生成可能 | 追加原本不要 | GEBCO のクレジット条件に従う | GEBCO リリース単位 | 位置ずれ評価の基準ではなく、比較対象そのもの |

## DATA / MODEL の区分

- GSI、Natural Earth、OSM の現在海岸線は `DATA` として表示する。
- GEBCO 0 m 等値線は「現在海岸線の表示用近似」であり、厳密な観測海岸線とは
  区別する。
- 指定海面から計算した推定海岸線は `MODEL` として表示する。
- Phase 1.5 では候補データを新規取得して重ねていないため、GEBCO との位置ずれを
  数値測定していない。複雑な湾岸・小島では GEBCO の約15秒格子と各ベクターの
  表現縮尺の差が見える可能性があり、Phase 2 前に代表6地域でオーバーレイ確認する。

## Phase 2 での採用手順

1. Natural Earth 1:10m Coastline と Minor Islands を取得し、全国表示用に切り出す。
2. 東京湾、伊勢・三河湾、瀬戸内海、対馬・津軽・宗谷海峡で GEBCO 0 m 近似との
   距離差と見た目を確認する。
3. 詳細表示で差が問題になる地域だけ GSI 基盤地図情報を取得して照合する。
4. クレジット欄にデータ名、バージョン、取得日、URLを固定する。

## 参照

- [国土地理院 基盤地図情報](https://web1.gsi.go.jp/kiban/index.html)
- [基盤地図情報 FAQ（海岸線・精度）](https://www.gsi.go.jp/kiban/faq.html)
- [国土地理院コンテンツ利用規約](https://www.gsi.go.jp/GSI/chosaku.htm)
- [測量成果の利用手続](https://web1.gsi.go.jp/LAW/2930-index.html)
- [Natural Earth 1:10m Physical Vectors](https://www.naturalearthdata.com/downloads/10m-physical-vectors/)
- [Natural Earth Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/)
- [OpenStreetMap Copyright and License](https://www.openstreetmap.org/copyright)

# Phase 2 Web MVP実装記録

## 実装結果

Phase 1/1.5のGEBCO_2026モデルを、−140 m〜−80 mの5 m刻みで13段階生成しました。各段階は同じ4近傍外洋連結判定、表示範囲、0.005°簡略化を使います。未簡略化GeoJSONは検証用に保持し、Web配信はPMTilesを正本とします。

Web MVPはReact 19、TypeScript 6、Vite 8、MapLibre GL JS 6、PMTiles 4で構成しました。画面上では現在陸域、新たに露出する陸域、現在海岸線、推定海岸線を色・線・透明度で区別します。海面、カメラ、レイヤー、選択中の解説ポイントはURLへ保存されます。

## データ容量

| 区分 | 13段階合計 |
|---|---:|
| 未簡略化GeoJSON | 124,871,978 bytes |
| 0.005°簡略GeoJSON | 39,596,547 bytes |
| PMTiles | 6,514,649 bytes |
| 未簡略化頂点 | 3,391,304 |
| 簡略化後頂点 | 1,067,621 |
| PMTilesタイル | 4,800 |
| データ生成時間 | 663.90秒 |

−120 m単体は、未簡略化9,515,205 bytes、簡略化2,997,543 bytes、PMTiles 492,057 bytes、Feature数3です。面積、全13段階の個別容量、処理時間は`outputs/phase2/data-statistics.json`を正本とします。

## ブラウザ実測

ローカルVite production preview、Chromium、1440×900、キャッシュを共有しない3回で計測しました。UI準備時間の中央値は630.3 ms、DOM Content Loadedは166.2〜242.7 msでした。本番JSは314,901 bytes、CSSは12,178 bytesの圧縮転送で、初期PMTilesは全492,057 bytesではなく16,384 bytesと252 bytesのRange Responseでした。結果の正本は`outputs/phase2/web-performance.json`です。

## テスト

- Pytest: manifest、Flood Fill、GeoJSON、面積単調性、13 PMTiles、Natural Earth参照データ
- Vitest: URL状態、海水準、DATA/MODEL/STORY、不確実性、13ファイル存在
- Playwright: 初期表示、スライダー、URL共有、レイヤー、カメラ保持、360px、コンソールエラー
- 通信契約: 初期表示は−120 m PMTilesのみを取得し、河川GeoJSONはONまで取得しない

## 視覚QA

PC 1440×900、タブレット768×900、スマートフォン360×780で確認しました。スマートフォンでは操作パネルを初期状態で閉じ、地図と海面スライダーを優先します。瀬戸内海、対馬海峡、津軽海峡、宗谷海峡は不確実性ポイントを選択した拡大画像を人間レビュー用に保存しました。

## 制約と人間レビュー

- 面積は日本国土ではなく、Webレビューbbox内の推定陸域
- bbox西端にクリップ境界があり、中国・朝鮮半島・サハリン等もモデル範囲へ含まれる
- 津軽海峡は−120 mでも水路を表示するが、幅・連続性は解像度依存
- 宗谷・対馬・瀬戸内海は浅海域の微細形状と簡略化影響を要レビュー
- Natural Earth海岸線とGEBCOモデル線の局所位置ずれは仕様上残る
- 本番JSはgzip約318 KBだが、未圧縮チャンクが500 KBを超えるVite警告が残る

Phase 2 MVPとして先へ進めますが、公開前に上記4地域の画像、表示bbox、学術解説、モバイルの都市ラベル密度を人間が判断する必要があります。

# Deep Time data policy

v0.1 の manifest は全件 `unconnected` です。現時点で地図に表示する Deep Time geometry はありません。

- 原典、対象年代、作成手法、座標系、精度、更新日、利用条件、Public 配布可否を dataset ごとに確認してから接続します。
- `license` と `publicAllowed` の未確認値は `null` のまま保持します。採用・公開は Human Gate です。
- 推測した海岸線、標高閾値だけの復元、PDF の手動トレース、生成 AI による geometry は追加しません。
- `EVIDENCE` は観測・解析データ、`RECONSTRUCTION` は根拠に基づく推定復元、`ILLUSTRATION` は理解補助の概略です。分類も原典確認後に決めます。
- 将来候補は縄文海進、最終氷期、埋没谷、沖積層基底、地形分類、地質、活断層です。候補は採用決定を意味しません。
- 接続済み dataset だけ利用者操作後に遅延取得します。取得・検証失敗時は描画しません。

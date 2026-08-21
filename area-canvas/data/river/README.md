# 河川データ（W05）のInternal / Public境界

`aichi.geojson`は国土交通省「国土数値情報 河川データ（W05）」から生成する、
**Internal / Local QA専用**の生成物です。公式ページ上の使用許諾条件が「非商用」のため、
public repository、GitHub Pages、顧客Pilotへ配布しません。

- generator：`scripts/generate-river.cjs`
- 公式参照ページ：<https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W05.html>
- 愛知県source：`W05-08_23_GML.zip`
- local生成：`npm run data:river`
- 生成先：`area-canvas/data/river/aichi.geojson`（`.gitignore`対象）

Public版ではファイルが存在しないことを正常状態とし、河川checkboxは安全にOFFへ戻ります。
`npm run check:area-canvas-public`は、生成物がGit追跡対象へ混入していないことを検査します。

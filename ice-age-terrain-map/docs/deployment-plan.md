# デプロイ計画

## 現段階

デプロイ、Git commit、push、既存Pages設定変更は行いません。`npm run build`で生成される`app/dist/`を静的成果物として検証します。

## Vercel候補

- Root Directory: `ice-age-terrain-map/app`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js: packageとCIで固定する
- SPA fallback: query parameterのみ使用するため、MVPは追加rewrite不要
- PMTiles: `Accept-Ranges: bytes`、206 Partial Content、正しいContent-Typeをデプロイ後に確認

現在の配信用PMTilesは13ファイル合計6,514,649 bytesです。Natural Earth参照GeoJSONとアプリ資産を含めてもMVPとして静的配信可能な規模です。

## 外部ストレージへ分離する条件

- 地域別高詳細版、標高陰影、年代レイヤーの追加で配信物が大きくなる
- Vercelの転送量・デプロイ上限へ近づく
- PMTiles更新をアプリのデプロイと分離したい

この場合はS3互換オブジェクトストレージ＋CDNを候補とし、GET/HEAD、Range Request、CORS、長期cache、versioned URLを確認します。アプリ側は`terrain/index.json`のbase URLを環境設定へ切り出します。

## 公開前チェック

1. 人間レビュー対象4海域と表示bboxを承認
2. DATA / MODEL / STORY本文と出典を学術レビュー
3. `npm run lint`, `npm run test`, `npm run build`, `npm run test:e2e`
4. デプロイURLでPC、768px、360pxを再確認
5. 13段階すべての200/206、CORS、キャッシュを確認
6. Lighthouseまたは同等手段で低速回線・モバイル性能を再計測

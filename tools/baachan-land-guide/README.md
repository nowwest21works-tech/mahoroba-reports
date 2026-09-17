# まほろばあちゃん｜土地探しの道案内

3つの質問（気になること・検討段階・エリア）から、次に確認する情報源を根拠付きで1〜2件案内する静的Pilotです。回答や任意メモはブラウザ内だけで扱い、送信・保存しません。

## Local preview

`dist/` を静的HTTPサーバーで配信してください。`file://` ではなくHTTPで確認します。

## Checks

```powershell
node tests/recommendations.test.cjs
```

推薦は `dist/assets/app.js` の `recommendationPlan` で「関心 × 検討段階」を明示し、エリア適合を確認します。Notion APIへブラウザから接続せず、公開可能な道具データだけを静的に保持しています。将来DBと同期する場合は、公開可能な項目をビルド時にJSONへ変換する方式を想定します。

## Sites

`.openai/hosting.json` の `project_id` が独立したSitesプロジェクトを示します。公開・外部共有・既存サイトの置換はHuman Gate対象です。

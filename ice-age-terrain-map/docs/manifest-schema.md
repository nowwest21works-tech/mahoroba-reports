# 成果物 manifest schema

Phase 1、Phase 1.5、Phase 2のmanifestは
`scripts/common/manifest.py` の共通ロジックで生成する。

## 文字コード

- ファイルはBOMなしUTF-8、改行はLF。
- Pythonの読み書きでは常に `encoding="utf-8"` を明示する。
- `json.dumps(..., ensure_ascii=False)` を使い、日本語を `\uXXXX` へ
  エスケープせず人が確認できる形で保持する。
- JSONとしての意味は `ensure_ascii=True` でも同一だが、文字化けの早期発見と
  レビュー性を優先して `False` に固定する。

Phase 1の旧manifestは、PowerShell上の文字コード変換を経た文字列が
`age_label` に混入し、終端引用符も失われたため解析不能になった。修復スクリプトは
旧manifestを入力にせず、UTF-8メタデータと変更していない成果物から再構築する。

## ルートオブジェクト

| フィールド | 型 | 必須 | 内容 |
|---|---|---|---|
| `schema_version` | string | yes | 現在は `1.0` |
| `manifest_type` | string | yes | `artifact-manifest` |
| `phase` | string | yes | `1`、`1.5`、`2` 等 |
| `dataset` | string | yes | 主データセット名 |
| `metadata` | object | no | 海面、入力、文字コード等のphase固有情報 |
| `artifacts` | array | yes | 成果物の完全性情報 |

## artifact

| フィールド | 型 | 内容 |
|---|---|---|
| `file` | string | manifest基準のPOSIX相対パス |
| `bytes` | integer | ファイルサイズ |
| `sha256` | string | 64文字の小文字SHA-256 |

日時は決定性を損なうためmanifestへ含めない。取得日時はデータソース別metadataへ
記録する。

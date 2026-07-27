# 愛知県 区域区分データ

このdirectoryには、国土交通省「不動産情報ライブラリ」XKT001から取得・正規化した愛知県の静的GeoJSONを配置します。

本PRの実装段階ではAPIキーが未提供のため、製品用GeoJSON `aichi.geojson` はまだ生成していません。テスト専用fixtureは `tests/journey-map/fixtures/urban-area-classification.geojson` に分離し、製品画面から参照しません。

## データソース

- 公式データ名：都市計画決定GISデータ（都市計画区域／区域区分）
- API：XKT001
- データ作成年度：令和7年度（2025年度）
- 提供：国土交通省 不動産情報ライブラリ
- API仕様：<https://www.reinfolib.mlit.go.jp/help/apiManual/xkt001/>
- 利用規約：<https://www.reinfolib.mlit.go.jp/help/termsOfUse/>

APIは利用申請・審査後に発行されるAPIキーをリクエストheaderへ指定します。APIキーはrepository、生成物、logへ含めません。ブラウザからAPIを直接呼び出さず、開発環境で静的GeoJSONを生成します。

API利用申請の「利用目的」記載案：

```text
不動産検討支援用の社内地図に、愛知県内の都市計画区域・区域区分を参考情報として
表示するために利用します。XKT001を開発環境で取得し、必要属性の正規化と必要に
応じた軽量化を行った静的GeoJSONを生成します。APIキーをブラウザや利用者へ公開せず、
建築可否等の正式判断には使用しません。出典、非保証、自治体窓口での確認案内を表示します。
```

## 生成

PowerShellで、このprocessだけにAPIキーを設定して実行します。

```powershell
$env:REINFOLIB_API_KEY = Read-Host "不動産情報ライブラリ APIキー"
node scripts/generate-urban-area-classification.cjs
Remove-Item Env:REINFOLIB_API_KEY
```

標準設定は愛知県を覆うzoom 11のXYZ tileを順番に取得し、250ms間隔を空けます。出力先は次の相対pathです。

```text
journey-map/data/urban-area-classification/aichi.geojson
```

元データのPolygon／MultiPolygonだけを採用し、愛知県以外を除外したうえで、UI用のschemaVersion 1へ正規化します。出力propertiesは以下に限定します。

- `schemaVersion`
- `layerType`
- `classificationCode`
- `classificationLabel`
- `planningAreaName`（元データに存在する場合だけ）
- `prefectureName`
- `municipalityName`
- `referenceYear`
- `sourceName`
- `sourceDataset`

## 簡略化

既定値ではジオメトリを簡略化しません。元容量・描画時間を確認後、境界の見え方を自治体公表図と比較できる場合だけ、degree単位のtoleranceを明示して再生成します。

```powershell
node scripts/generate-urban-area-classification.cjs --tolerance 0.00001
```

簡略化前後の容量、Feature数、PC／mobile表示を比較し、実務上の誤認を招く境界崩れがないことを確認してください。

## 表示上の制約

- 無色部分は都市計画区域外とは限らず、データ未収録の可能性があります。
- 都市計画区域名はXKT001の公開項目に含まれない場合があり、その場合はpopupの項目自体を省略します。
- tile境界で同じ区域が複数Featureへ分割される場合があります。
- 掲載データは参考情報であり、建築確認申請、不動産重要事項説明、開発許可判断には使用できません。
- 正式かつ最新の区域は、各自治体の担当窓口で確認してください。

## 出典・加工表記

画面には次の出典とAPI規約上のcreditを表示します。

```text
出典：国土交通省 不動産情報ライブラリ
「都市計画決定GISデータ（令和7年度）」XKT001を加工
```

```text
このサービスは、国土交通省の不動産情報ライブラリのAPI機能を使用していますが、
提供情報の最新性、正確性、完全性等が保証されたものではありません
```

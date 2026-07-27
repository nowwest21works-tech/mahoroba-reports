# 愛知県 区域区分データ

このdirectoryには、国土交通省「不動産情報ライブラリ」XKT001から取得・正規化した愛知県の静的GeoJSONを配置します。

製品用GeoJSONは `aichi.geojson` です。テスト専用fixtureは `tests/journey-map/fixtures/urban-area-classification.geojson` に分離し、製品画面から参照しません。

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

PowerShellで、入力内容を画面へ表示せず、このprocessだけにAPIキーを設定して実行します。

```powershell
$secureApiKey = Read-Host "不動産情報ライブラリ APIキー" -AsSecureString
$apiKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureApiKey)
try {
  $env:REINFOLIB_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($apiKeyPointer)
  npm.cmd run data:urban-area
} finally {
  Remove-Item Env:REINFOLIB_API_KEY -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($apiKeyPointer)
}
```

標準設定は愛知県を覆うzoom 11のXYZ tileを順番に取得し、250ms間隔を空けます。出力先は次の相対pathです。

```text
journey-map/data/urban-area-classification/aichi.geojson
```

## 2026-07-27 実データ監査

Windowsのユーザー環境変数に設定したAPIキーを値非表示で確認し、既定設定（zoom 11、簡略化なし）で生成しました。APIキー本体はAPI応答、error、repository内の生成物・文書・screenshotから検出されていません。

- 取得tile：56
- 元API応答容量（56 tile合計、隣県およびtile重複を含む）：28,349,930 bytes（27.04 MiB）
- 生成後容量：7,127,572 bytes（6.80 MiB、末尾改行を含む）
- Feature数：1,667
- geometry：Polygon 1,461、MultiPolygon 206
- 座標点：166,064
- ring：3,143（未閉鎖0、非有限座標0）
- 簡略化：なし（`simplificationToleranceDegrees: 0`）
- 正規化後分類：市街化区域346、市街化調整区域603、都市計画区域718、unknown 0
- 表示対象：市街化区域346、市街化調整区域603（合計949）
- 非表示保持：都市計画区域718
- 未知の元分類値：なし
- 元tile内分類（重複除去前）：都市計画区域720、市街化区域346、市街化調整区域605

Chromiumで静的local HTTP配信からレイヤーを初回ONにし、GeoJSON取得開始から949 SVG pathの表示完了までを1回測定しました。

- PC 1440×900：438 ms（GeoJSON resource 105.5 ms）
- mobile 360×800：520 ms（GeoJSON resource 49.8 ms）
- 360px凡例：地図領域内に収まることを座標で確認
- 境界品質：zoom 13で簡略化由来の欠落・ring切れは見られず、細街区レベルの輪郭を保持
- 表示layer：949 Featureすべてが市街化区域または市街化調整区域で、`city-planning-area` は0
- 操作：表示対象区域のclickでCircleは増加せず、親ポリゴンはpopup・click判定へ参加しない

実データscreenshot：

- `docs/screenshots/urban-area-classification-desktop.png`
- `docs/screenshots/urban-area-classification-mobile.png`
- `docs/screenshots/urban-area-classification-boundary-detail.png`

### 分類と表示対象

XKT001の `area_classification_ja = 都市計画区域` は、市街化区域・市街化調整区域の上位にあたる都市計画区域ポリゴンとして `city-planning-area` へ正規化します。`非線引き都市計画区域` へは読み替えません。

今回のMVPで塗りつぶし、境界線、popup、クリック判定、凡例へ追加するのは市街化区域・市街化調整区域だけです。`city-planning-area` 718 FeatureはGeoJSONへ保持しますが、Leaflet layerの生成時に除外します。

非線引き都市計画区域は、XYZ tileの結合・重複・欠損による誤判定を避けるため、都市計画区域から2分類を差し引く差分geometryで推定しません。公式の属性定義または別データで確実に判定できる方法を調査する後続課題です。

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

- 非線引き都市計画区域および都市計画区域外は判定・表示しません。
- 無色部分は都市計画区域外または非線引き区域を意味せず、データ未収録の可能性もあります。
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

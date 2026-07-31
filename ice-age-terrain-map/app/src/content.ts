import type { InterpretationPoint } from "./types";

const gebcoSource = {
  label: "GEBCO_2026 Grid",
  url: "https://www.gebco.net/data-products/gridded-bathymetry-data",
  classification: "DATA" as const,
};

const modelSource = {
  label: "Phase 2 配信用地形レイヤー索引",
  url: "data/terrain/index.json",
  classification: "MODEL" as const,
};

export const INTERPRETATION_POINTS: InterpretationPoint[] = [
  {
    id: "tokyo-bay",
    name: "東京湾",
    coordinates: [139.78, 35.45],
    category: "change",
    dataText: "現在は湾として海域が広がり、首都圏の沿岸都市が連なっています。",
    modelText: "海面−120mモデルでは、湾の大部分が推定陸域として表示されます。",
    storyText: "現在の湾岸を、長い地形変化の途中にある風景として眺め直せます。",
    confidence: "medium",
    detailConfidence: "low",
    sources: [gebcoSource, modelSource],
  },
  {
    id: "ise-mikawa-bay",
    name: "伊勢湾・三河湾",
    coordinates: [136.86, 34.67],
    category: "change",
    dataText: "現在は伊勢湾と三河湾が濃尾平野・三河地域の海側に広がっています。",
    modelText: "海面−120mモデルでは、両湾の大部分が推定陸域として表示されます。",
    storyText: "湾岸都市の足元を、かつての低地や河谷につながる風景として考えられます。",
    confidence: "medium",
    detailConfidence: "low",
    sources: [gebcoSource, modelSource],
  },
  {
    id: "seto-inland-sea",
    name: "瀬戸内海",
    coordinates: [133.55, 34.24],
    category: "uncertainty",
    dataText: "現在は多数の島と細い水路からなる内海です。",
    modelText:
      "海面−120mモデルでは広い範囲が推定陸域になりますが、島と水路の細部は格子解像度に敏感です。",
    storyText: "島・水路・移動経路が海面変化でどう組み替わるかを考える場所です。",
    confidence: "medium",
    detailConfidence: "low",
    sources: [gebcoSource, modelSource],
  },
  {
    id: "tsushima-strait",
    name: "対馬海峡",
    coordinates: [129.35, 34.35],
    category: "uncertainty",
    dataText: "現在は九州・対馬・朝鮮半島の間に水路があります。",
    modelText:
      "浅海域の広い露出を示しますが、陸続き／水路の状態は海面値と地形解像度で変わります。",
    storyText: "移動可能性を一本の線で断定せず、複数の条件から問い直す地点です。",
    confidence: "medium",
    detailConfidence: "low",
    sources: [gebcoSource, modelSource],
  },
  {
    id: "tsugaru-strait",
    name: "津軽海峡",
    coordinates: [140.65, 41.5],
    category: "uncertainty",
    dataText: "現在は本州と北海道を隔てる海峡です。",
    modelText:
      "海面−120mでも水路が表示されますが、幅や連続性の細部はモデル条件に依存します。",
    storyText: "海峡の開閉を断定せず、地形・海面・地殻変動の組合せを考える地点です。",
    confidence: "medium",
    detailConfidence: "low",
    sources: [gebcoSource, modelSource],
  },
  {
    id: "soya-strait",
    name: "宗谷海峡",
    coordinates: [142.0, 45.5],
    category: "uncertainty",
    dataText: "現在は北海道とサハリンの間に海峡があります。",
    modelText:
      "海面−120mモデルでは広い推定陸域が現れますが、連続状態は解像度・地殻変動で変わります。",
    storyText: "陸橋という結論ではなく、北方の移動環境が変化した可能性を考える地点です。",
    confidence: "medium",
    detailConfidence: "low",
    sources: [gebcoSource, modelSource],
  },
  {
    id: "nobi-plain",
    name: "濃尾平野",
    coordinates: [136.75, 35.16],
    category: "story",
    dataText: "現在は木曽三川下流に広がる低平地です。",
    modelText:
      "本モデルは現在地形に海面閾値を適用するため、当時の堆積面や河道を直接復元しません。",
    storyText: "都市と平野の関係を、海面と河川がつくる変化の途中として考えられます。",
    confidence: "medium",
    detailConfidence: "low",
    sources: [gebcoSource, modelSource],
  },
];

export const POINT_IDS = new Set(INTERPRETATION_POINTS.map((point) => point.id));

export const UNCERTAINTY_NOTICE =
  "この付近の陸続き／水路の状態は、海面設定、地形データの解像度、地殻変動によって結果が変わります。";

export const CONFIDENCE_LABELS = {
  high: "高",
  medium: "中",
  low: "低",
} as const;

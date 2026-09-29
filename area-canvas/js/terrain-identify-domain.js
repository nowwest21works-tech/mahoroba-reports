((globalThis) => {
  const TILE_ROOT = 'https://cyberjapandata.gsi.go.jp/xyz/experimental_landformclassification';
  const OFFICIAL_LEGEND_URL = 'https://www.gsi.go.jp/bousaichiri/lfc_index.html';
  const CLASSES = Object.freeze({
    '10501': ['扇状地', '山地の谷の出口から扇状に広がる傾斜の緩やかな土地。谷口からの氾濫によって運ばれた土砂が堆積してできる。', '山地からの出水による浸水や、谷口に近い場所では土石流のリスクがあります。'],
    '10502': ['扇状地', '山地の谷の出口から扇状に広がる傾斜の緩やかな土地。谷口からの氾濫によって運ばれた土砂が堆積してできる。', '山地からの出水による浸水や、谷口に近い場所では土石流のリスクがあります。'],
    '3020101': ['扇状地', '山地の谷の出口から扇状に広がる傾斜の緩やかな土地。谷口からの氾濫によって運ばれた土砂が堆積してできる。', '山地からの出水による浸水や、谷口に近い場所では土石流のリスクがあります。'],
    '10503': ['自然堤防', '現在や昔の河川に沿って細長く分布し、周囲より0.5～数メートル高い土地。河川が氾濫した場所に土砂が堆積してできる。', '洪水に対しては比較的安全ですが、大規模な洪水では浸水することがあります。縁辺部では液状化の発生傾向が強いとされています。'],
    '3040101': ['自然堤防', '現在や昔の河川に沿って細長く分布し、周囲より0.5～数メートル高い土地。河川が氾濫した場所に土砂が堆積してできる。', '洪水に対しては比較的安全ですが、大規模な洪水では浸水することがあります。縁辺部では液状化の発生傾向が強いとされています。'],
    '10701': ['氾濫平野・海岸平野', '起伏が小さく、低くて平坦な土地。洪水で運ばれた砂や泥が河川周辺に堆積したり、過去の海底が干上がったりしてできます。', '河川氾濫に注意。海岸に近いほど地盤が軟弱で、地震時にやや揺れやすく、沿岸部では高潮にも注意が必要とされています。'],
    '10702': ['氾濫平野・海岸平野', '起伏が小さく、低くて平坦な土地。洪水で運ばれた砂や泥が河川周辺に堆積したり、過去の海底が干上がったりしてできます。', '河川氾濫に注意。海岸に近いほど地盤が軟弱で、地震時にやや揺れやすく、沿岸部では高潮にも注意が必要とされています。'],
    '10705': ['氾濫平野・海岸平野', '起伏が小さく、低くて平坦な土地。洪水で運ばれた砂や泥が河川周辺に堆積したり、過去の海底が干上がったりしてできます。', '河川氾濫に注意。海岸に近いほど地盤が軟弱で、地震時にやや揺れやすく、沿岸部では高潮にも注意が必要とされています。'],
    '3030101': ['氾濫平野・海岸平野', '起伏が小さく、低くて平坦な土地。洪水で運ばれた砂や泥が河川周辺に堆積したり、過去の海底が干上がったりしてできます。', '河川氾濫に注意。海岸に近いほど地盤が軟弱で、地震時にやや揺れやすく、沿岸部では高潮にも注意が必要とされています。'],
    '10703': ['後背低地・湿地', '主に氾濫平野の中にあり、周囲よりわずかに低い土地。洪水による砂や礫の堆積がほとんどなく、泥が堆積してできます。', '河川氾濫時に周囲より長期間浸水し、水はけが悪く、地盤が軟弱で揺れが大きくなりやすいとされています。'],
    '10804': ['後背低地・湿地', '主に氾濫平野の中にあり、周囲よりわずかに低い土地。洪水による砂や礫の堆積がほとんどなく、泥が堆積してできます。', '河川氾濫時に周囲より長期間浸水し、水はけが悪く、地盤が軟弱で揺れが大きくなりやすいとされています。'],
    '3030201': ['後背低地・湿地', '主に氾濫平野の中にあり、周囲よりわずかに低い土地。洪水による砂や礫の堆積がほとんどなく、泥が堆積してできます。', '河川氾濫時に周囲より長期間浸水し、水はけが悪く、地盤が軟弱で揺れが大きくなりやすいとされています。'],
    '10704': ['旧河道', 'かつて河川の流路だった場所で、周囲よりわずかに低い土地。流路の移動で河川から切り離され、その後に砂や泥などで埋められてできます。', '河川氾濫時に周囲より長期間浸水し、水はけが悪く、地盤が軟弱で揺れが大きくなりやすいとされています。'],
    '3040201': ['旧河道', 'かつて河川の流路だった場所で、周囲よりわずかに低い土地。流路の移動で河川から切り離され、その後に砂や泥などで埋められてできます。', '河川氾濫時に周囲より長期間浸水し、水はけが悪く、地盤が軟弱で揺れが大きくなりやすいとされています。'],
    '3040202': ['旧河道', 'かつて河川の流路だった場所で、周囲よりわずかに低い土地。流路の移動で河川から切り離され、その後に砂や泥などで埋められてできます。', '河川氾濫時に周囲より長期間浸水し、水はけが悪く、地盤が軟弱で揺れが大きくなりやすいとされています。'],
  });

  function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] || [];
      const [xj, yj] = ring[j] || [];
      if (![xi, yi, xj, yj].every(Number.isFinite)) return false;
      const intersects = ((yi > point[1]) !== (yj > point[1]))
        && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function geometryContainsPoint(geometry, latlng) {
    if (!geometry || !latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return false;
    const point = [latlng.lng, latlng.lat];
    const polygonContains = (rings) => Array.isArray(rings) && rings.length > 0
      && pointInRing(point, rings[0]) && !rings.slice(1).some((ring) => pointInRing(point, ring));
    if (geometry.type === 'Polygon') return polygonContains(geometry.coordinates);
    if (geometry.type === 'MultiPolygon') return Array.isArray(geometry.coordinates)
      && geometry.coordinates.some(polygonContains);
    return false;
  }

  function findFeatureAtPoint(collection, latlng) {
    if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) return null;
    return collection.features.find((feature) => feature?.type === 'Feature'
      && geometryContainsPoint(feature.geometry, latlng)) || null;
  }

  function classifyCode(value) {
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d{5,8}$/.test(String(value))) return null;
    const code = String(value);
    const entry = CLASSES[code];
    return Object.freeze({
      code,
      name: entry?.[0] || null,
      genesis: entry?.[1] || null,
      risk: entry?.[2] || null,
      sourceUrl: OFFICIAL_LEGEND_URL,
    });
  }

  function tileUrl(map, latlng, z) {
    if (!map || !latlng || !Number.isInteger(z) || z < 5 || z > 16) return null;
    const point = map.project(latlng, z).divideBy(256).floor();
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return [1, 2].map((kind) => `${TILE_ROOT}${kind}/${z}/${point.x}/${point.y}.geojson`);
  }

  const api = Object.freeze({ classifyCode, findFeatureAtPoint, geometryContainsPoint, tileUrl });
  globalThis.TerrainIdentifyDomain = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

// Leaflet adapter. Only approved, connected datasets may reach fetch or the map.
(() => {
  const panes = { era: 'deep-time-era', evidence: 'deep-time-evidence' };
  for (const [key, name] of Object.entries(panes)) {
    map.createPane(name);
    map.getPane(name).style.zIndex = key === 'era' ? '305' : '310';
    map.getPane(name).style.pointerEvents = 'none';
  }
  const layers = new Map();
  let requestVersion = 0;

  function clear() {
    requestVersion += 1;
    for (const layer of layers.values()) if (map.hasLayer(layer)) map.removeLayer(layer);
  }

  async function apply(state, manifest) {
    const version = ++requestVersion;
    const selection = DeepTimeDomain.effectiveSelection(state, manifest);
    const ids = selection.era === 'present'
      ? selection.overlays : [selection.era, ...selection.overlays];
    for (const [id, layer] of layers) {
      if (!ids.includes(id) && map.hasLayer(layer)) map.removeLayer(layer);
    }
    for (const id of ids) {
      const dataset = manifest.datasets.find((item) => item.id === id);
      if (!DeepTimeDomain.available(manifest, id)) continue;
      try {
        if (!layers.has(id)) {
          const response = await fetch(dataset.url, { cache: 'no-cache' });
          if (!response.ok) throw new Error('取得失敗');
          const geojson = DeepTimeDomain.validateGeoJson(await response.json(), dataset);
          const layer = L.geoJSON(geojson, {
            pane: id === selection.era ? panes.era : panes.evidence,
            interactive: false, pmIgnore: true,
          });
          layers.set(id, layer);
        }
        if (version !== requestVersion) return;
        const layer = layers.get(id);
        layer.eachLayer((featureLayer) => {
          if (featureLayer.setStyle) featureLayer.setStyle({ opacity: state.opacity / 100,
            fillOpacity: state.opacity / 100 });
        });
        layer.addTo(map);
      } catch (_) {
        if (version === requestVersion) showStatus(`${dataset.title}：データを表示できません`, 3500);
      }
    }
  }

  globalThis.DeepTimeLayers = { clear, apply };
})();

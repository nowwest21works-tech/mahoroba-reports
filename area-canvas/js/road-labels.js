// ========== 道路名ラベル（手動登録） ==========
// 国土数値情報の道路データ(N13)には路線名（国道◯号・県道◯号等）の属性が含まれないため、
// 現地確認済みの地点だけ data/road/route-labels.json へ手動登録する。
// 未登録の間はラベルを一切表示しない（座標・路線名を推測で生成しない）。
(() => {
  const DATA_URL = './data/road/route-labels.json';
  const stateEl = document.getElementById('road-label-state');
  const PANE_NAME = 'road-labels';
  map.createPane(PANE_NAME);
  map.getPane(PANE_NAME).style.zIndex = '340';

  function escapeHtmlLocal(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function validateEntries(entries) {
    if (!Array.isArray(entries)) {
      throw new TypeError('route-labels.jsonはentryの配列である必要があります');
    }
    entries.forEach((entry, index) => {
      if (typeof entry.name !== 'string' || !entry.name.trim()) {
        throw new TypeError(`entry[${index}]：nameが必要です`);
      }
      if (typeof entry.lat !== 'number' || typeof entry.lng !== 'number') {
        throw new TypeError(`entry[${index}]：lat/lngは数値で指定してください`);
      }
    });
    return entries;
  }

  function buildLabel(entry) {
    return L.marker([entry.lat, entry.lng], {
      pane: PANE_NAME,
      interactive: false,
      pmIgnore: true,
      icon: L.divIcon({
        className: 'road-label-icon',
        html: `<span>${escapeHtmlLocal(entry.name)}</span>`,
        iconSize: null,
      }),
    });
  }

  fetch(DATA_URL, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`route-labels.jsonを取得できませんでした (${response.status})`);
      return response.json();
    })
    .then(validateEntries)
    .then((entries) => {
      const group = L.layerGroup(entries.map(buildLabel));
      if (entries.length > 0) group.addTo(map);
      stateEl.textContent = `登録ラベル：${entries.length}件`;
      stateEl.dataset.kind = entries.length > 0 ? 'success' : 'idle';
    })
    .catch((error) => {
      stateEl.textContent = `道路名ラベル：${error.message}`;
      stateEl.dataset.kind = 'error';
    });
})();

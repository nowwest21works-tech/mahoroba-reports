// ========== ハザードマップ ==========
// 国交省ハザードマップポータルサイトの公開タイル
const HAZARD_TILES = {
  flood: {
    url: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png',
    attribution: '出典：<a href="https://disaportal.gsi.go.jp/" target="_blank">国土交通省 ハザードマップポータルサイト</a>',
    maxZoom: 17, minZoom: 2
  },
  landslide: {
    url: 'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png',
    attribution: '出典：<a href="https://disaportal.gsi.go.jp/" target="_blank">国土交通省 ハザードマップポータルサイト</a>',
    maxZoom: 17, minZoom: 2
  },
  hightide: {
    url: 'https://disaportaldata.gsi.go.jp/raster/03_hightide_l2_shinsuishin_data/{z}/{x}/{y}.png',
    attribution: '出典：<a href="https://disaportal.gsi.go.jp/" target="_blank">国土交通省 ハザードマップポータルサイト</a>',
    maxZoom: 17, minZoom: 2
  },
  tsunami: {
    url: 'https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png',
    attribution: '出典：<a href="https://disaportal.gsi.go.jp/" target="_blank">国土交通省 ハザードマップポータルサイト</a>',
    maxZoom: 17, minZoom: 2
  }
};
const hazardLayers = {}; // key -> L.tileLayer
let hazardOpacity = 0.6;

function toggleHazard(key, enabled) {
  if (enabled) {
    if (!hazardLayers[key]) {
      const cfg = HAZARD_TILES[key];
      hazardLayers[key] = L.tileLayer(cfg.url, {
        attribution: cfg.attribution,
        maxZoom: cfg.maxZoom,
        minZoom: cfg.minZoom,
        opacity: hazardOpacity,
        crossOrigin: true,
        exportRole: 'hazard',
        pmIgnore: true,
      });
    }
    hazardLayers[key].addTo(map);
    hazardLayers[key].setOpacity(hazardOpacity);
  } else {
    if (hazardLayers[key]) map.removeLayer(hazardLayers[key]);
  }
}

document.querySelectorAll('.hazard-row input[type="checkbox"]').forEach(cb => {
  cb.addEventListener('change', (e) => {
    const key = cb.dataset.hazard;
    toggleHazard(key, cb.checked);
    const names = { flood: '洪水', landslide: '土砂', hightide: '高潮', tsunami: '津波' };
    showStatus(`${names[key]}ハザード：${cb.checked ? 'ON' : 'OFF'}`);
  });
});

const opacitySlider = document.getElementById('hazard-opacity');
const opacityVal = document.getElementById('hazard-opacity-val');
opacitySlider.addEventListener('input', () => {
  hazardOpacity = opacitySlider.value / 100;
  opacityVal.textContent = `${opacitySlider.value}%`;
  Object.values(hazardLayers).forEach(layer => {
    if (map.hasLayer(layer)) layer.setOpacity(hazardOpacity);
  });
});

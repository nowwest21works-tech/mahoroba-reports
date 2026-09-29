// ========== マップ初期化 ==========
// 名古屋駅をデフォルトに（まほろば不動産・名古屋拠点）
L.PM.initialize({
  optIn: true,
});
L.PM.setOptIn(true);

const map = L.map('map', {
  zoomControl: false,
  pmIgnore: false,
}).setView([35.1709, 136.8815], 14);
L.control.zoom({ position: 'bottomright' }).addTo(map);

// 地理院淡色を既定にし、OSMは利用者が明示選択した場合だけ読み込む。
const BASEMAP_LAYERS = {
  gsiPale: L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    minZoom: 5,
    maxZoom: 18,
    attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">国土地理院 / 地理院タイル</a>',
    crossOrigin: true,
    exportRole: 'base',
    pmIgnore: true,
  }),
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    crossOrigin: true,
    exportRole: 'base',
    pmIgnore: true,
  }),
};
let baseTileLayer = BASEMAP_LAYERS.gsiPale.addTo(map);

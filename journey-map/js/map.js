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

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  crossOrigin: true,
  exportRole: 'base',
  pmIgnore: true,
}).addTo(map);

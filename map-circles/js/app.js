// ========== マップクリック ==========
map.on('click', (e) => {
  addCircle(e.latlng.lat, e.latlng.lng);
});

// ========== パネルトグル ==========
document.getElementById('toggle-panel').addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('collapsed');
  setTimeout(() => map.invalidateSize(), 320);
});

// ========== 初期化 ==========
renderList();
showStatus('地図上をクリックして円を配置できます');

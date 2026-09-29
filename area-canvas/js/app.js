// ========== マップクリック ==========
map.on('click', (e) => {
  if (ResearchLayers.handleMapClick(e)) return;
  if (JourneyMapNotes.handleMapClick(e.latlng)) return;
  if (
    map.pm.globalDrawModeEnabled()
    || map.pm.globalEditModeEnabled()
    || map.pm.globalDragModeEnabled()
    || map.pm.globalRemovalModeEnabled()
  ) {
    return;
  }
  addCircle(e.latlng.lat, e.latlng.lng);
});

// ========== パネルトグル ==========
document.getElementById('toggle-panel').addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('collapsed');
  setTimeout(() => map.invalidateSize(), 320);
});
document.getElementById('close-panel').addEventListener('click', () => {
  document.getElementById('panel').classList.add('collapsed');
  setTimeout(() => map.invalidateSize(), 320);
});

// ========== 初期化 ==========
renderList();
JourneyMapExport.initialize({
  captureProjectState: MapCirclesAppState.captureProjectState,
  mapInstance: map,
  renderMap: globalThis.html2canvas,
});
ResearchLayers.initialize({ mapInstance: map });
showStatus('地図上をクリックして円を配置できます');

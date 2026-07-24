// ========== 円の追加 ==========
function addCircle(lat, lng, radius = currentRadius, color = currentColor, label = '') {
  const id = nextId++;
  const userLabel = label || document.getElementById('label-input').value.trim() || `地点${id}`;

  const circle = L.circle([lat, lng], {
    radius: radius,
    color: color,
    fillColor: color,
    fillOpacity: 0.15,
    weight: 2,
    opacity: 0.7
  }).addTo(map);

  const marker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      html: `<div class="circle-label" style="background:${color}">${escapeHtml(userLabel)} · ${formatRadius(radius)}</div>`,
      iconSize: [null, null],
      iconAnchor: [0, 0]
    })
  }).addTo(map);

  circles.push({ id, marker, circle, center: [lat, lng], radius, color, label: userLabel });
  renderList();
  showStatus(`「${userLabel}」を配置しました（${formatRadius(radius)}）`);

  // 入力リセット
  document.getElementById('label-input').value = '';
}

function removeCircle(id) {
  const idx = circles.findIndex(c => c.id === id);
  if (idx === -1) return;
  map.removeLayer(circles[idx].circle);
  map.removeLayer(circles[idx].marker);
  circles.splice(idx, 1);
  renderList();
}

function zoomToCircle(id) {
  const c = circles.find(c => c.id === id);
  if (!c) return;
  map.fitBounds(c.circle.getBounds(), { padding: [40, 40] });
}

function formatRadius(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

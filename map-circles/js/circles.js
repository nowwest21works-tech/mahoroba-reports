// ========== 円の追加 ==========
function assertCircleFeatureAlignment(circleRecords, featureCollection) {
  const featureIds = new Set(
    featureCollection.features.map((feature) => feature.id),
  );
  if (
    featureIds.size !== circleRecords.length
    || circleRecords.some((record) => !featureIds.has(record.featureId))
  ) {
    throw new Error('Circle and FeatureCollection state are inconsistent');
  }
}

function addCircle(lat, lng, radius = currentRadius, color = currentColor, label = '') {
  const id = nextId;
  const userLabel = label || document.getElementById('label-input').value.trim() || `地点${id}`;
  const feature = MapCirclesGeoJsonAdapter.circleRecordToFeature({
    center: [lat, lng],
    radius,
    color,
    label: userLabel,
  });
  const previousProject = getCurrentMapProject();
  assertCircleFeatureAlignment(circles, previousProject.featureCollection);
  const nextFeatureCollection = {
    type: 'FeatureCollection',
    features: [...previousProject.featureCollection.features, feature],
  };

  const circle = L.circle([lat, lng], {
    radius: radius,
    color: color,
    fillColor: color,
    fillOpacity: 0.15,
    weight: 2,
    opacity: 0.7
  });

  const marker = L.marker([lat, lng], {
    icon: L.divIcon({
      className: '',
      html: `<div class="circle-label" style="background:${color}">${escapeHtml(userLabel)} · ${formatRadius(radius)}</div>`,
      iconSize: [null, null],
      iconAnchor: [0, 0]
    })
  });

  let storeUpdated = false;
  let circleAdded = false;
  let markerAdded = false;
  let recordAdded = false;
  try {
    updateCurrentFeatureCollection(nextFeatureCollection);
    storeUpdated = true;
    circle.addTo(map);
    circleAdded = true;
    marker.addTo(map);
    markerAdded = true;

    circles.push({
      id,
      featureId: feature.id,
      marker,
      circle,
      center: [lat, lng],
      radius,
      color,
      label: userLabel,
    });
    recordAdded = true;
    renderList();
  } catch (error) {
    if (recordAdded) circles.pop();
    if (markerAdded && map.hasLayer(marker)) map.removeLayer(marker);
    if (circleAdded && map.hasLayer(circle)) map.removeLayer(circle);
    if (storeUpdated) {
      updateCurrentFeatureCollection(previousProject.featureCollection);
    }
    throw error;
  }

  nextId += 1;
  showStatus(`「${userLabel}」を配置しました（${formatRadius(radius)}）`);

  // 入力リセット
  document.getElementById('label-input').value = '';
  return circles[circles.length - 1];
}

function removeCircle(id) {
  const idx = circles.findIndex(c => c.id === id);
  if (idx === -1) return;
  const previousCircles = circles.slice();
  const target = circles[idx];
  const previousProject = getCurrentMapProject();
  assertCircleFeatureAlignment(circles, previousProject.featureCollection);
  const nextFeatureCollection = {
    type: 'FeatureCollection',
    features: previousProject.featureCollection.features.filter(
      (feature) => feature.id !== target.featureId,
    ),
  };

  let storeUpdated = false;
  try {
    updateCurrentFeatureCollection(nextFeatureCollection);
    storeUpdated = true;
    map.removeLayer(target.circle);
    map.removeLayer(target.marker);
    circles.splice(idx, 1);
    renderList();
  } catch (error) {
    circles = previousCircles;
    if (!map.hasLayer(target.circle)) target.circle.addTo(map);
    if (!map.hasLayer(target.marker)) target.marker.addTo(map);
    if (storeUpdated) {
      updateCurrentFeatureCollection(previousProject.featureCollection);
    }
    renderList();
    throw error;
  }
}

function clearAllCircles() {
  const previousCircles = circles.slice();
  const previousProject = getCurrentMapProject();
  assertCircleFeatureAlignment(circles, previousProject.featureCollection);
  let storeUpdated = false;
  try {
    updateCurrentFeatureCollection({
      type: 'FeatureCollection',
      features: [],
    });
    storeUpdated = true;
    circles.forEach((item) => {
      map.removeLayer(item.circle);
      map.removeLayer(item.marker);
    });
    circles = [];
    renderList();
  } catch (error) {
    circles = previousCircles;
    circles.forEach((item) => {
      if (!map.hasLayer(item.circle)) item.circle.addTo(map);
      if (!map.hasLayer(item.marker)) item.marker.addTo(map);
    });
    if (storeUpdated) {
      updateCurrentFeatureCollection(previousProject.featureCollection);
    }
    renderList();
    throw error;
  }
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

// ========== 図形と非永続Storeのprivate runtime ==========
const {
  addCircle,
  removeCircle,
  zoomToCircle,
} = (() => {
  const store = MapCirclesMemoryStore.createMemoryStore();
  const household = store.createHousehold({
    displayCode: 'HH-001',
  });
  const journey = store.createJourney({
    householdId: household.id,
    serviceType: 'land_purchase',
    displayLabel: '検討1',
    status: 'active',
  });
  const mapProject = store.createMapProject({
    journeyId: journey.id,
    displayLabel: '条件整理マップ1',
  });
  const mapProjectId = mapProject.id;
  const layerRegistry = new Map();
  const featureIdByLayer = new WeakMap();
  let geometryEditorLifecycle = null;
  let mapNotesLifecycle = null;

  function getCurrentMapProject() {
    return store.getMapProject(mapProjectId);
  }

  function getCurrentSnapshotProject() {
    const snapshot = store.snapshot();
    return snapshot.mapProjects.find((project) => project.id === mapProjectId);
  }

  function updateCurrentFeatureCollection(featureCollection) {
    return store.updateMapProject(mapProjectId, {
      featureCollection,
    });
  }

  function updateCurrentProjectState(featureCollection, viewport) {
    return store.updateMapProject(mapProjectId, {
      featureCollection,
      viewport,
    });
  }

  globalThis.MapCirclesAppState = Object.freeze({
    captureProjectState,
    getCurrentMapProject,
    getSnapshot: () => store.snapshot(),
    replaceProjectState,
  });

  function createCircleLabelIcon(label, radius, color) {
    return L.divIcon({
      className: '',
      html: `<div class="circle-label" style="background:${color}">${escapeHtml(label)} · ${formatRadius(radius)}</div>`,
      iconSize: [null, null],
      iconAnchor: [0, 0],
    });
  }

  function createMapNoteMarkerIcon() {
    return L.divIcon({
      className: 'map-note-pin',
      html: '<span aria-hidden="true"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  L.Marker.prototype.options.icon = createMapNoteMarkerIcon();

  function createCircleLabelLayer(record) {
    return L.marker(record.center, {
      icon: createCircleLabelIcon(record.label, record.radius, record.color),
      interactive: false,
      pmIgnore: true,
    });
  }

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function captureProjectState() {
    const center = map.getCenter();
    return {
      featureCollection: cloneData(getCurrentSnapshotProject().featureCollection),
      viewport: {
        center: { lat: center.lat, lng: center.lng },
        zoom: map.getZoom(),
      },
    };
  }

  function createLayerBundle(feature, circleId) {
    const record = MapCirclesGeoJsonAdapter.featureToShapeRecord(feature);
    const pathOptions = record.kind === 'marker'
      ? { pmIgnore: false }
      : {
        color: record.color,
        fillColor: record.color,
        fillOpacity: record.kind === 'line' ? 0 : 0.15,
        opacity: 0.7,
        weight: 2,
        pmIgnore: false,
      };
    let layer;
    let labelLayer = null;
    let circleRecord = null;

    if (record.kind === 'marker') {
      layer = L.marker(record.center, {
        ...pathOptions,
        icon: createMapNoteMarkerIcon(),
      });
    } else if (record.kind === 'circle') {
      layer = L.circle(record.center, {
        ...pathOptions,
        radius: record.radius,
      });
      labelLayer = createCircleLabelLayer(record);
      circleRecord = {
        id: circleId,
        ...record,
        marker: labelLayer,
        circle: layer,
      };
    } else if (record.kind === 'line') {
      layer = L.polyline(record.points, pathOptions);
    } else {
      const outerRing = record.rings[0];
      const unclosedRing = outerRing.slice(0, -1);
      layer = L.polygon(unclosedRing, pathOptions);
    }

    return {
      circleRecord,
      feature,
      labelLayer,
      layer,
    };
  }

  function emitStateChanged(reason) {
    document.dispatchEvent(new CustomEvent('journeymap:state-changed', {
      detail: { reason },
    }));
  }

  function replaceProjectState(featureCollection, viewport) {
    MapCirclesDomain.validateFeatureCollection(featureCollection);
    const previousProject = getCurrentSnapshotProject();
    const previousState = captureProjectState();
    const previousCircles = cloneCircleRecords();
    const previousEntries = Array.from(layerRegistry.entries());
    const previousListDom = captureCircleListDom();
    const previousNextId = nextId;
    let circleId = 1;
    const prepared = featureCollection.features.map((feature) => {
      const bundle = createLayerBundle(cloneData(feature), circleId);
      if (bundle.circleRecord) circleId += 1;
      return bundle;
    });

    try {
      previousEntries.forEach(([featureId, entry]) => {
        unregisterFeature(featureId);
        if (map.hasLayer(entry.layer)) map.removeLayer(entry.layer);
        if (entry.labelLayer && map.hasLayer(entry.labelLayer)) {
          map.removeLayer(entry.labelLayer);
        }
      });
      updateCurrentProjectState(cloneData(featureCollection), cloneData(viewport));
      circles = [];
      prepared.forEach((bundle) => {
        bundle.layer.addTo(map);
        if (bundle.labelLayer) bundle.labelLayer.addTo(map);
        registerFeature(bundle.feature, bundle.layer, bundle.labelLayer);
        if (bundle.circleRecord) circles.push(bundle.circleRecord);
      });
      nextId = circleId;
      map.setView(
        [viewport.center.lat, viewport.center.lng],
        viewport.zoom,
        { animate: false },
      );
      renderList();
      emitStateChanged('replace');
    } catch (error) {
      prepared.forEach((bundle) => {
        unregisterFeature(bundle.feature.id);
        if (map.hasLayer(bundle.layer)) map.removeLayer(bundle.layer);
        if (bundle.labelLayer && map.hasLayer(bundle.labelLayer)) {
          map.removeLayer(bundle.labelLayer);
        }
      });
      updateCurrentProjectState(
        previousProject.featureCollection,
        previousState.viewport,
      );
      previousEntries.forEach(([featureId, entry]) => {
        restoreRegistryEntry(featureId, entry);
        if (!map.hasLayer(entry.layer)) entry.layer.addTo(map);
        if (entry.labelLayer && !map.hasLayer(entry.labelLayer)) {
          entry.labelLayer.addTo(map);
        }
      });
      circles = previousCircles;
      nextId = previousNextId;
      map.setView(
        [previousState.viewport.center.lat, previousState.viewport.center.lng],
        previousState.viewport.zoom,
        { animate: false },
      );
      restoreCircleListDom(previousListDom);
      throw error;
    }
  }

  function registerFeature(feature, layer, labelLayer = null) {
    if (layerRegistry.has(feature.id)) {
      throw new Error(`Feature layer already registered: ${feature.id}`);
    }
    layer.options.pmIgnore = false;
    layerRegistry.set(feature.id, {
      kind: feature.properties.kind,
      layer,
      labelLayer,
    });
    featureIdByLayer.set(layer, feature.id);
    if (!geometryEditorLifecycle) {
      throw new Error('Geometry editor lifecycle is unavailable');
    }
    geometryEditorLifecycle.bindLayer(layer);
    if (feature.properties.kind === 'marker') {
      if (!mapNotesLifecycle) {
        throw new Error('Map notes lifecycle is unavailable');
      }
      mapNotesLifecycle.bindMarkerLayer(layer, feature);
    }
  }

  function unregisterFeature(featureId) {
    const entry = layerRegistry.get(featureId);
    if (!entry) return null;
    if (entry.kind === 'marker' && mapNotesLifecycle) {
      mapNotesLifecycle.unbindMarkerLayer(featureId, entry.layer);
    }
    layerRegistry.delete(featureId);
    featureIdByLayer.delete(entry.layer);
    return entry;
  }

  function restoreRegistryEntry(featureId, entry) {
    layerRegistry.set(featureId, entry);
    featureIdByLayer.set(entry.layer, featureId);
    if (!geometryEditorLifecycle) {
      throw new Error('Geometry editor lifecycle is unavailable');
    }
    geometryEditorLifecycle.bindLayer(entry.layer);
    if (entry.kind === 'marker') {
      if (!mapNotesLifecycle) {
        throw new Error('Map notes lifecycle is unavailable');
      }
      const feature = findFeature(featureId);
      if (!feature) throw new Error('Map note feature is unavailable');
      mapNotesLifecycle.bindMarkerLayer(entry.layer, feature);
    }
  }

  function assertRuntimeAlignment(featureCollection) {
    const featureIds = new Set(featureCollection.features.map((feature) => feature.id));
    if (
      featureIds.size !== layerRegistry.size
      || [...featureIds].some((featureId) => !layerRegistry.has(featureId))
    ) {
      throw new Error('Layer registry and FeatureCollection state are inconsistent');
    }

    const circleIds = new Set(
      featureCollection.features
        .filter((feature) => feature.properties.kind === 'circle')
        .map((feature) => feature.id),
    );
    if (
      circleIds.size !== circles.length
      || circles.some((record) => !circleIds.has(record.featureId))
    ) {
      throw new Error('Circle list and FeatureCollection state are inconsistent');
    }
  }

  function captureCircleListDom() {
    return {
      badgeText: document.getElementById('count-badge').textContent,
      listHtml: document.getElementById('circle-list').innerHTML,
    };
  }

  function restoreCircleListDom(snapshot) {
    document.getElementById('count-badge').textContent = snapshot.badgeText;
    document.getElementById('circle-list').innerHTML = snapshot.listHtml;
  }

  function cloneCircleRecords() {
    return circles.map((record) => ({
      ...record,
      center: [...record.center],
    }));
  }

  function findFeature(featureId, featureCollection = getCurrentSnapshotProject().featureCollection) {
    return featureCollection.features.find((feature) => feature.id === featureId);
  }

  function createNextFeatureCollection(previousProject, feature) {
    const nextFeatureCollection = {
      type: 'FeatureCollection',
      features: [...previousProject.featureCollection.features, feature],
    };
    MapCirclesDomain.validateFeatureCollection(nextFeatureCollection);
    return nextFeatureCollection;
  }

  function replaceFeature(previousProject, feature) {
    const nextFeatureCollection = {
      type: 'FeatureCollection',
      features: previousProject.featureCollection.features.map((current) =>
        current.id === feature.id ? feature : current),
    };
    MapCirclesDomain.validateFeatureCollection(nextFeatureCollection);
    return nextFeatureCollection;
  }

  function commitCreatedFeature(feature, layer) {
    MapCirclesDomain.validateMapFeature(feature);
    const previousProject = getCurrentSnapshotProject();
    assertRuntimeAlignment(previousProject.featureCollection);
    const nextFeatureCollection = createNextFeatureCollection(previousProject, feature);
    const previousCircles = cloneCircleRecords();
    const previousListDom = captureCircleListDom();
    const previousNextId = nextId;
    let labelLayer = null;

    try {
      if (feature.properties.kind === 'marker') {
        layer.setIcon(createMapNoteMarkerIcon());
      }
      if (!map.hasLayer(layer)) layer.addTo(map);
      if (feature.properties.kind === 'circle') {
        const shapeRecord = MapCirclesGeoJsonAdapter.featureToCircleRecord(feature);
        labelLayer = createCircleLabelLayer(shapeRecord).addTo(map);
        circles.push({
          id: previousNextId,
          ...shapeRecord,
          marker: labelLayer,
          circle: layer,
        });
        renderList();
      }
      registerFeature(feature, layer, labelLayer);
      updateCurrentFeatureCollection(nextFeatureCollection);
    } catch (error) {
      circles = previousCircles;
      unregisterFeature(feature.id);
      if (labelLayer && map.hasLayer(labelLayer)) map.removeLayer(labelLayer);
      if (map.hasLayer(layer)) map.removeLayer(layer);
      restoreCircleListDom(previousListDom);
      nextId = previousNextId;
      throw error;
    }

    if (feature.properties.kind === 'circle') nextId = previousNextId + 1;
    emitStateChanged('create');
    return layerRegistry.get(feature.id);
  }

  function commitEditedFeature(featureId, feature) {
    MapCirclesDomain.validateMapFeature(feature);
    if (feature.id !== featureId) {
      throw new Error('Feature ID cannot change during edit');
    }
    const previousProject = getCurrentSnapshotProject();
    assertRuntimeAlignment(previousProject.featureCollection);
    const previousFeature = findFeature(featureId, previousProject.featureCollection);
    const entry = layerRegistry.get(featureId);
    if (!previousFeature || !entry) throw new Error('Edited feature is not registered');
    if (previousFeature.properties.kind !== feature.properties.kind) {
      throw new Error('Feature kind cannot change during edit');
    }

    const nextFeatureCollection = replaceFeature(previousProject, feature);
    const previousCircles = cloneCircleRecords();
    const previousListDom = captureCircleListDom();

    try {
      if (feature.properties.kind === 'circle') {
        const shapeRecord = MapCirclesGeoJsonAdapter.featureToCircleRecord(feature);
        const index = circles.findIndex((record) => record.featureId === featureId);
        if (index === -1 || !entry.labelLayer) {
          throw new Error('Edited circle state is incomplete');
        }
        circles[index] = {
          ...circles[index],
          ...shapeRecord,
        };
        entry.labelLayer.setLatLng(shapeRecord.center);
        entry.labelLayer.setIcon(
          createCircleLabelIcon(
            shapeRecord.label,
            shapeRecord.radius,
            shapeRecord.color,
          ),
        );
        renderList();
      } else if (feature.properties.kind === 'marker') {
        mapNotesLifecycle.updateMarkerLayer(entry.layer, feature);
      }
      updateCurrentFeatureCollection(nextFeatureCollection);
    } catch (error) {
      circles = previousCircles;
      const previousCircle = previousCircles.find(
        (record) => record.featureId === featureId,
      );
      if (previousCircle && entry.labelLayer) {
        entry.labelLayer.setLatLng(previousCircle.center);
        entry.labelLayer.setIcon(
          createCircleLabelIcon(
            previousCircle.label,
            previousCircle.radius,
            previousCircle.color,
          ),
        );
      } else if (previousFeature.properties.kind === 'marker') {
        mapNotesLifecycle.updateMarkerLayer(entry.layer, previousFeature);
      }
      restoreCircleListDom(previousListDom);
      throw error;
    }

    emitStateChanged('edit');
    return feature;
  }

  function commitRemovedFeature(featureId, removedLayer) {
    const previousProject = getCurrentSnapshotProject();
    const previousFeature = findFeature(featureId, previousProject.featureCollection);
    const entry = layerRegistry.get(featureId);
    const previousCircles = cloneCircleRecords();
    const previousListDom = captureCircleListDom();
    const previousNextId = nextId;

    try {
      assertRuntimeAlignment(previousProject.featureCollection);
      if (!previousFeature || !entry || entry.layer !== removedLayer) {
        throw new Error('Removed feature is not registered');
      }
      const nextFeatureCollection = {
        type: 'FeatureCollection',
        features: previousProject.featureCollection.features.filter(
          (feature) => feature.id !== featureId,
        ),
      };
      MapCirclesDomain.validateFeatureCollection(nextFeatureCollection);
      if (map.hasLayer(removedLayer)) map.removeLayer(removedLayer);
      unregisterFeature(featureId);
      if (entry.kind === 'circle') {
        circles = circles.filter((record) => record.featureId !== featureId);
        if (entry.labelLayer && map.hasLayer(entry.labelLayer)) {
          map.removeLayer(entry.labelLayer);
        }
        renderList();
      }
      updateCurrentFeatureCollection(nextFeatureCollection);
    } catch (error) {
      circles = previousCircles;
      if (entry) restoreRegistryEntry(featureId, entry);
      if (!map.hasLayer(removedLayer)) removedLayer.addTo(map);
      if (entry && entry.labelLayer && !map.hasLayer(entry.labelLayer)) {
        entry.labelLayer.addTo(map);
      }
      restoreCircleListDom(previousListDom);
      nextId = previousNextId;
      throw error;
    }
    emitStateChanged('remove');
  }

  function addCircle(
    lat,
    lng,
    radius = currentRadius,
    color = currentColor,
    label = '',
  ) {
    const userLabel =
      label
      || document.getElementById('label-input').value.trim()
      || `地点${nextId}`;
    const feature = MapCirclesGeoJsonAdapter.circleRecordToFeature({
      center: [lat, lng],
      radius,
      color,
      label: userLabel,
    });
    const circle = L.circle([lat, lng], {
      radius,
      color,
      fillColor: color,
      fillOpacity: 0.15,
      weight: 2,
      opacity: 0.7,
      pmIgnore: false,
    });

    commitCreatedFeature(feature, circle);
    showStatus(`「${userLabel}」を配置しました（${formatRadius(radius)}）`);
    document.getElementById('label-input').value = '';
    return circles[circles.length - 1];
  }

  function createMapNote(lat, lng, label) {
    const feature = MapCirclesGeoJsonAdapter.shapeRecordToFeature({
      kind: 'marker',
      center: [lat, lng],
      label,
    });
    const layer = L.marker([lat, lng], {
      icon: createMapNoteMarkerIcon(),
      pmIgnore: false,
    });
    commitCreatedFeature(feature, layer);
    return cloneData(feature);
  }

  function updateMapNote(featureId, label) {
    const previousFeature = findFeature(featureId);
    if (!previousFeature || previousFeature.properties.kind !== 'marker') {
      throw new Error('選択した地図メモが見つかりません');
    }
    const record = MapCirclesGeoJsonAdapter.featureToShapeRecord(previousFeature);
    const feature = MapCirclesGeoJsonAdapter.shapeRecordToFeature({
      ...record,
      label,
    });
    commitEditedFeature(featureId, feature);
    return cloneData(feature);
  }

  function removeCircle(id) {
    const target = circles.find((record) => record.id === id);
    if (!target) return;
    commitRemovedFeature(target.featureId, target.circle);
  }

  function clearAllCircles() {
    const previousProject = getCurrentSnapshotProject();
    assertRuntimeAlignment(previousProject.featureCollection);
    const previousCircles = cloneCircleRecords();
    const previousListDom = captureCircleListDom();
    const previousNextId = nextId;
    const circleEntries = previousCircles.map((record) => ({
      featureId: record.featureId,
      entry: layerRegistry.get(record.featureId),
    }));
    const nextFeatureCollection = {
      type: 'FeatureCollection',
      features: previousProject.featureCollection.features.filter(
        (feature) => feature.properties.kind !== 'circle',
      ),
    };
    MapCirclesDomain.validateFeatureCollection(nextFeatureCollection);

    try {
      circleEntries.forEach(({ featureId, entry }) => {
        unregisterFeature(featureId);
        if (entry && map.hasLayer(entry.layer)) map.removeLayer(entry.layer);
        if (entry && entry.labelLayer && map.hasLayer(entry.labelLayer)) {
          map.removeLayer(entry.labelLayer);
        }
      });
      circles = [];
      renderList();
      updateCurrentFeatureCollection(nextFeatureCollection);
    } catch (error) {
      circles = previousCircles;
      circleEntries.forEach(({ featureId, entry }) => {
        if (!entry) return;
        restoreRegistryEntry(featureId, entry);
        if (!map.hasLayer(entry.layer)) entry.layer.addTo(map);
        if (entry.labelLayer && !map.hasLayer(entry.labelLayer)) {
          entry.labelLayer.addTo(map);
        }
      });
      restoreCircleListDom(previousListDom);
      nextId = previousNextId;
      throw error;
    }
    emitStateChanged('clear-circles');
  }

  function zoomToCircle(id) {
    const circleRecord = circles.find((item) => item.id === id);
    if (!circleRecord) return;
    map.fitBounds(circleRecord.circle.getBounds(), { padding: [40, 40] });
  }

  document.addEventListener('mapcircles:geometry-editor-ready', (event) => {
    if (!event.detail || typeof event.detail.initialize !== 'function') {
      throw new Error('Geometry editor initializer is unavailable');
    }
    geometryEditorLifecycle = event.detail.initialize(Object.freeze({
      commitCreatedFeature,
      commitEditedFeature,
      commitRemovedFeature,
      featureIdForLayer: (layer) => featureIdByLayer.get(layer),
      getCurrentFeature: (featureId) => findFeature(featureId),
      getEntry: (featureId) => layerRegistry.get(featureId),
      isRegisteredLayer: (layer) => featureIdByLayer.has(layer),
    }));
    if (
      !geometryEditorLifecycle
      || typeof geometryEditorLifecycle.bindLayer !== 'function'
    ) {
      throw new Error('Geometry editor lifecycle is invalid');
    }
  }, { once: true });

  document.addEventListener('journeymap:map-notes-ready', (event) => {
    if (!event.detail || typeof event.detail.initialize !== 'function') {
      throw new Error('Map notes initializer is unavailable');
    }
    mapNotesLifecycle = event.detail.initialize(Object.freeze({
      createMapNote,
      getFeature: (featureId) => {
        const feature = findFeature(featureId);
        return feature ? cloneData(feature) : null;
      },
      updateMapNote,
    }));
    if (
      !mapNotesLifecycle
      || typeof mapNotesLifecycle.bindMarkerLayer !== 'function'
      || typeof mapNotesLifecycle.unbindMarkerLayer !== 'function'
      || typeof mapNotesLifecycle.updateMarkerLayer !== 'function'
    ) {
      throw new Error('Map notes lifecycle is invalid');
    }
  }, { once: true });

  let clearArmed = false;
  let clearArmedTimer = null;
  const clearBtn = document.getElementById('clear-all');
  const clearBtnOriginalText = clearBtn.textContent;

  clearBtn.addEventListener('click', () => {
    if (circles.length === 0) {
      showStatus('削除する円がありません');
      return;
    }

    if (!clearArmed) {
      clearArmed = true;
      clearBtn.textContent = `本当に削除？もう一度クリック（${circles.length}個）`;
      clearBtn.style.background = 'var(--accent)';
      clearBtn.style.color = 'white';
      clearBtn.style.borderColor = 'var(--accent)';
      showStatus('もう一度クリックで全削除（3秒で取消）', 3000);

      clearArmedTimer = setTimeout(() => {
        clearArmed = false;
        clearBtn.textContent = clearBtnOriginalText;
        clearBtn.style.background = '';
        clearBtn.style.color = '';
        clearBtn.style.borderColor = '';
      }, 3000);
      return;
    }

    clearTimeout(clearArmedTimer);
    const count = circles.length;
    clearAllCircles();
    clearArmed = false;
    clearBtn.textContent = clearBtnOriginalText;
    clearBtn.style.background = '';
    clearBtn.style.color = '';
    clearBtn.style.borderColor = '';
    showStatus(`${count}個の円をすべて削除しました`);
  });

  return Object.freeze({
    addCircle,
    removeCircle,
    zoomToCircle,
  });
})();

globalThis.addCircle = addCircle;
globalThis.removeCircle = removeCircle;
globalThis.zoomToCircle = zoomToCircle;

function formatRadius(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

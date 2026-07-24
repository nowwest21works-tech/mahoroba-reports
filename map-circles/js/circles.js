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

  globalThis.MapCirclesAppState = Object.freeze({
    getCurrentMapProject,
    getSnapshot: () => store.snapshot(),
  });

  function createCircleLabelIcon(label, radius, color) {
    return L.divIcon({
      className: '',
      html: `<div class="circle-label" style="background:${color}">${escapeHtml(label)} · ${formatRadius(radius)}</div>`,
      iconSize: [null, null],
      iconAnchor: [0, 0],
    });
  }

  function createCircleLabelLayer(record) {
    return L.marker(record.center, {
      icon: createCircleLabelIcon(record.label, record.radius, record.color),
      interactive: false,
      pmIgnore: true,
    });
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
  }

  function unregisterFeature(featureId) {
    const entry = layerRegistry.get(featureId);
    if (!entry) return null;
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
      }
      restoreCircleListDom(previousListDom);
      throw error;
    }

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

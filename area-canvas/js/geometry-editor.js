// ========== Leaflet-Geoman geometry editor ==========
(() => {
  const shapeCounters = {
    marker: 1,
    circle: 1,
    line: 1,
    polygon: 1,
  };
  const boundLayers = new WeakSet();
  const editSnapshots = new WeakMap();
  const dragSnapshots = new WeakMap();
  let runtime = null;

  const shapeNames = {
    Circle: 'circle',
    Line: 'line',
    Marker: 'marker',
    Polygon: 'polygon',
    Polyline: 'line',
  };
  const defaultLabelPrefixes = {
    marker: '地点',
    circle: '円',
    line: '線',
    polygon: '範囲',
  };

  function latLngPair(latlng) {
    return [latlng.lat, latlng.lng];
  }

  function closeRing(points) {
    if (points.length === 0) return points;
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return points;
    return [...points, [...first]];
  }

  function featureToLatLngs(feature) {
    if (feature.properties.kind === 'line') {
      return feature.geometry.coordinates.map(
        ([lng, lat]) => [lat, lng],
      );
    }
    return feature.geometry.coordinates[0]
      .slice(0, -1)
      .map(([lng, lat]) => [lat, lng]);
  }

  function restoreLayerGeometry(layer, feature) {
    const { kind } = feature.properties;
    if (kind === 'marker') {
      const [lng, lat] = feature.geometry.coordinates;
      layer.setLatLng([lat, lng]);
      return;
    }
    if (kind === 'circle') {
      const [lng, lat] = feature.geometry.coordinates;
      layer.setLatLng([lat, lng]);
      layer.setRadius(feature.properties.radiusMeters);
      return;
    }
    if (kind === 'line') {
      layer.setLatLngs(featureToLatLngs(feature));
      return;
    }
    layer.setLatLngs([featureToLatLngs(feature)]);
  }

  function recordFromLayer(layer, kind, properties) {
    const identity = properties.featureId
      ? { featureId: properties.featureId }
      : {};
    if (kind === 'marker') {
      return {
        kind,
        ...identity,
        center: latLngPair(layer.getLatLng()),
        label: properties.label,
      };
    }
    if (kind === 'circle') {
      return {
        kind,
        ...identity,
        center: latLngPair(layer.getLatLng()),
        radius: layer.getRadius(),
        color: properties.color,
        label: properties.label,
      };
    }
    if (kind === 'line') {
      return {
        kind,
        ...identity,
        points: layer.getLatLngs().map(latLngPair),
        color: properties.color,
        label: properties.label,
      };
    }

    const latlngs = layer.getLatLngs();
    if (latlngs.length !== 1 || !Array.isArray(latlngs[0])) {
      throw new Error('Polygon must contain exactly one outer ring');
    }
    return {
      kind,
      ...identity,
      rings: [closeRing(latlngs[0].map(latLngPair))],
      color: properties.color,
      label: properties.label,
    };
  }

  function createFeatureFromLayer(layer, kind, feature = null) {
    const input = document.getElementById('label-input').value.trim();
    const properties = feature
      ? {
        featureId: feature.id,
        color: feature.properties.color,
        label: feature.properties.label,
      }
      : {
        color: currentColor,
        label: input || `${defaultLabelPrefixes[kind]}${shapeCounters[kind]}`,
      };
    const record = recordFromLayer(layer, kind, properties);
    return MapCirclesGeoJsonAdapter.shapeRecordToFeature(record);
  }

  function styleCreatedLayer(layer, kind) {
    layer.options.pmIgnore = false;
    if (kind === 'circle' || kind === 'line' || kind === 'polygon') {
      layer.setStyle({
        color: currentColor,
        fillColor: currentColor,
        fillOpacity: kind === 'line' ? 0 : 0.15,
        opacity: 0.7,
        weight: 2,
      });
    }
  }

  function handleCreate(event) {
    const kind = shapeNames[event.shape];
    if (!kind) {
      if (map.hasLayer(event.layer)) map.removeLayer(event.layer);
      return;
    }
    const layer = event.layer;
    try {
      styleCreatedLayer(layer, kind);
      const feature = createFeatureFromLayer(layer, kind);
      runtime.commitCreatedFeature(feature, layer);
      shapeCounters[kind] += 1;
      document.getElementById('label-input').value = '';
      showStatus(`「${feature.properties.label}」を追加しました`);
    } catch (error) {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      showStatus(`図形を追加できませんでした: ${error.message}`, 4000);
    }
  }

  function captureLayerSnapshot(layer, snapshots) {
    const featureId = runtime.featureIdForLayer(layer);
    if (!featureId) {
      snapshots.delete(layer);
      return;
    }
    const feature = runtime.getCurrentFeature(featureId);
    if (feature) snapshots.set(layer, feature);
  }

  function commitLayerEdit(layer, snapshots) {
    const featureId = runtime.featureIdForLayer(layer);
    if (!featureId) {
      snapshots.delete(layer);
      return;
    }
    const previousFeature =
      snapshots.get(layer) || runtime.getCurrentFeature(featureId);
    if (!previousFeature) {
      snapshots.delete(layer);
      return;
    }

    try {
      const feature = createFeatureFromLayer(
        layer,
        previousFeature.properties.kind,
        previousFeature,
      );
      runtime.commitEditedFeature(featureId, feature);
      showStatus(`「${feature.properties.label}」を更新しました`);
    } catch (error) {
      restoreLayerGeometry(layer, previousFeature);
      showStatus(`編集を元に戻しました: ${error.message}`, 4000);
    } finally {
      snapshots.delete(layer);
    }
  }

  function bindCanonicalLayer(layer) {
    if (boundLayers.has(layer)) return;

    layer.on('pm:enable', () => {
      captureLayerSnapshot(layer, editSnapshots);
    });
    layer.on('pm:update', () => {
      if (!runtime.isRegisteredLayer(layer)) {
        editSnapshots.delete(layer);
        return;
      }
      commitLayerEdit(layer, editSnapshots);
    });
    layer.on('pm:dragstart', () => {
      captureLayerSnapshot(layer, dragSnapshots);
    });
    layer.on('pm:dragend', () => {
      if (!runtime.isRegisteredLayer(layer)) {
        dragSnapshots.delete(layer);
        return;
      }
      commitLayerEdit(layer, dragSnapshots);
    });

    boundLayers.add(layer);
  }

  function handleRemove(event) {
    const featureId = runtime.featureIdForLayer(event.layer);
    if (!featureId) return;
    try {
      runtime.commitRemovedFeature(featureId, event.layer);
      showStatus('図形を削除しました');
    } catch (error) {
      showStatus(`削除を元に戻しました: ${error.message}`, 4000);
    }
  }

  function initialize(capabilities) {
    runtime = capabilities;

    map.pm.setLang('ja', {
      tooltips: {
        placeMarker: 'クリックして地点を置く',
        placeMarkerTouch: '地図をタップして地点を置く',
        firstVertex: 'クリックして最初の頂点を置く',
        continueLine: 'クリックして次の頂点を置く',
        finishLine: '最後の頂点をクリックして線を確定',
        finishPoly: '最初の頂点をクリックして範囲を確定',
        startCircle: 'クリックして円の中心を置く',
        finishCircle: 'クリックして円の大きさを確定',
      },
      buttonTitles: {
        drawMarkerButton: '地点を置く',
        drawPolyButton: '範囲を描く',
        drawLineButton: '線を描く',
        drawCircleButton: '円を描く',
        editButton: '形を編集',
        dragButton: '全体を移動',
        deleteButton: '削除する',
      },
    }, 'ja');
    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
      continueDrawing: false,
      minRadiusCircle: 50,
      maxRadiusCircle: 50000,
      pathOptions: {
        color: currentColor,
        fillColor: currentColor,
        fillOpacity: 0.15,
        opacity: 0.7,
        weight: 2,
      },
    });
    map.pm.addControls({
      position: 'topright',
      drawMarker: true,
      drawCircle: true,
      drawPolyline: true,
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      removalMode: true,
      drawCircleMarker: false,
      drawRectangle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    });
    const toolbarLabels = {
      marker: '地点を置く',
      circle: '円を描く',
      polyline: '線を描く',
      polygon: '範囲を描く',
      edit: '形を編集',
      drag: '全体を移動',
      delete: '削除する',
    };
    Object.entries(toolbarLabels).forEach(([iconName, label]) => {
      const icon = document.querySelector(`.leaflet-pm-icon-${iconName}`);
      const button = icon && (icon.closest('a, button') || icon);
      if (!button) return;
      button.title = label;
      button.setAttribute('aria-label', label);
    });

    map.on('pm:globaldrawmodetoggled', () => {
      map.pm.setGlobalOptions({
        allowSelfIntersection: false,
        minRadiusCircle: 50,
        maxRadiusCircle: 50000,
        pathOptions: {
          color: currentColor,
          fillColor: currentColor,
          fillOpacity: 0.15,
          opacity: 0.7,
          weight: 2,
        },
      });
    });
    map.on('pm:create', handleCreate);
    map.on('pm:remove', handleRemove);

    return Object.freeze({
      bindLayer: bindCanonicalLayer,
    });
  }

  document.dispatchEvent(new CustomEvent('mapcircles:geometry-editor-ready', {
    detail: { initialize },
  }));
})();

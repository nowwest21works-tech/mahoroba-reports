// ========== Marker labelを使う地図メモ ==========
(() => {
  const MAX_LENGTH = 120;
  const elements = {
    input: document.getElementById('map-note-input'),
    counter: document.getElementById('map-note-counter'),
    place: document.getElementById('place-map-note'),
    update: document.getElementById('update-map-note'),
    state: document.getElementById('map-note-state'),
  };
  const markerLayers = new Map();
  const markerClickHandlers = new WeakMap();
  let runtime = null;
  let placementMode = false;
  let selectedFeatureId = null;

  function createNoteContent(label) {
    const content = document.createElement('div');
    content.className = 'map-note-content';
    content.textContent = label;
    return content;
  }

  function setState(message, kind = 'normal') {
    elements.state.textContent = message;
    elements.state.dataset.kind = kind;
  }

  function updateCounter() {
    const length = elements.input.value.length;
    elements.counter.textContent = `${length} / ${MAX_LENGTH}`;
    elements.counter.dataset.kind = length > MAX_LENGTH ? 'error' : 'normal';
  }

  function readValidLabel() {
    const label = elements.input.value.trim();
    if (!label) throw new Error('地図メモを入力してください');
    if (label.length > MAX_LENGTH) {
      throw new Error(`地図メモは${MAX_LENGTH}文字以内で入力してください`);
    }
    return label;
  }

  function anyGeometryModeEnabled() {
    return (
      map.pm.globalDrawModeEnabled()
      || map.pm.globalEditModeEnabled()
      || map.pm.globalDragModeEnabled()
      || map.pm.globalRemovalModeEnabled()
    );
  }

  function renderPlacementMode() {
    elements.place.setAttribute('aria-pressed', String(placementMode));
    map.getContainer().classList.toggle(
      'map-note-placement-active',
      placementMode,
    );
  }

  function setPlacementMode(active) {
    placementMode = active;
    renderPlacementMode();
  }

  function showError(error) {
    setState(error.message, 'error');
    showStatus(error.message, 4000);
  }

  function setLayerSelected(layer, selected) {
    const markerElement = layer.getElement();
    if (markerElement) {
      markerElement.classList.toggle('map-note-marker-selected', selected);
    }
    const tooltip = layer.getTooltip();
    const tooltipElement = tooltip && tooltip.getElement();
    if (tooltipElement) {
      tooltipElement.classList.toggle('map-note-tooltip-selected', selected);
    }
  }

  function selectFeature(featureId) {
    const feature = runtime.getFeature(featureId);
    if (!feature || feature.properties.kind !== 'marker') {
      clearSelection();
      return;
    }
    selectedFeatureId = featureId;
    markerLayers.forEach((layer, currentFeatureId) => {
      setLayerSelected(layer, currentFeatureId === featureId);
    });
    elements.input.value = feature.properties.label;
    elements.update.disabled = false;
    updateCounter();
    setState(`選択中: ${feature.properties.label}`);
  }

  function clearSelection(clearInput = false) {
    selectedFeatureId = null;
    markerLayers.forEach((layer) => setLayerSelected(layer, false));
    elements.update.disabled = true;
    if (clearInput) {
      elements.input.value = '';
      updateCounter();
    }
    setState('メモは選択されていません');
  }

  function updateMarkerLayer(layer, feature) {
    const content = createNoteContent(feature.properties.label);
    if (layer.getTooltip()) {
      layer.setTooltipContent(content);
    } else {
      layer.bindTooltip(content, {
        className: 'map-note-tooltip',
        direction: 'top',
        offset: [0, -22],
        opacity: 1,
        permanent: true,
      });
    }
    const markerElement = layer.getElement();
    if (markerElement) markerElement.classList.add('map-note-marker');
    setLayerSelected(layer, feature.id === selectedFeatureId);
  }

  function bindMarkerLayer(layer, feature) {
    markerLayers.set(feature.id, layer);
    updateMarkerLayer(layer, feature);
    if (!markerClickHandlers.has(layer)) {
      const handleClick = () => selectFeature(feature.id);
      markerClickHandlers.set(layer, handleClick);
      layer.on('click', handleClick);
    }
  }

  function unbindMarkerLayer(featureId, layer) {
    if (markerLayers.get(featureId) === layer) markerLayers.delete(featureId);
    if (layer.getTooltip()) layer.unbindTooltip();
    if (selectedFeatureId === featureId) clearSelection();
  }

  function handleMapClick(latlng) {
    if (!placementMode) return false;
    try {
      const label = readValidLabel();
      const feature = runtime.createMapNote(latlng.lat, latlng.lng, label);
      setPlacementMode(false);
      selectFeature(feature.id);
      showStatus('地図メモを配置しました');
    } catch (error) {
      setPlacementMode(false);
      showError(error);
    }
    return true;
  }

  function initialize(capabilities) {
    runtime = capabilities;
    return Object.freeze({
      bindMarkerLayer,
      unbindMarkerLayer,
      updateMarkerLayer,
    });
  }

  elements.input.addEventListener('input', updateCounter);
  elements.place.addEventListener('click', () => {
    if (placementMode) {
      setPlacementMode(false);
      setState('メモの配置を取り消しました');
      showStatus('メモの配置を取り消しました');
      return;
    }
    try {
      readValidLabel();
      if (anyGeometryModeEnabled()) {
        throw new Error('図形操作を終了してから地図メモを置いてください');
      }
      setPlacementMode(true);
      setState('配置場所を地図上でクリックしてください');
      showStatus('地図上の配置したい場所をクリックしてください');
    } catch (error) {
      showError(error);
    }
  });
  elements.update.addEventListener('click', () => {
    try {
      if (!selectedFeatureId) {
        throw new Error('更新する地図メモを選択してください');
      }
      const label = readValidLabel();
      const feature = runtime.updateMapNote(selectedFeatureId, label);
      selectFeature(feature.id);
      showStatus('地図メモを更新しました');
    } catch (error) {
      showError(error);
    }
  });

  [
    'pm:globaldrawmodetoggled',
    'pm:globaleditmodetoggled',
    'pm:globaldragmodetoggled',
    'pm:globalremovalmodetoggled',
  ].forEach((eventName) => {
    map.on(eventName, () => {
      if (!placementMode || !anyGeometryModeEnabled()) return;
      setPlacementMode(false);
      setState('図形操作を開始したためメモの配置を取り消しました');
    });
  });

  document.addEventListener('journeymap:state-changed', (event) => {
    if (event.detail && event.detail.reason === 'replace') {
      setPlacementMode(false);
      clearSelection(true);
      return;
    }
    if (selectedFeatureId && !runtime.getFeature(selectedFeatureId)) {
      clearSelection(true);
    }
  });

  updateCounter();
  renderPlacementMode();
  globalThis.JourneyMapNotes = Object.freeze({ handleMapClick });
  document.dispatchEvent(new CustomEvent('journeymap:map-notes-ready', {
    detail: { initialize },
  }));
})();

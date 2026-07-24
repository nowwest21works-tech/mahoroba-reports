// ========== 円と非永続Storeのprivate runtime ==========
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

  function addCircle(
    lat,
    lng,
    radius = currentRadius,
    color = currentColor,
    label = '',
  ) {
    const id = nextId;
    const userLabel =
      label
      || document.getElementById('label-input').value.trim()
      || `地点${id}`;
    const feature = MapCirclesGeoJsonAdapter.circleRecordToFeature({
      center: [lat, lng],
      radius,
      color,
      label: userLabel,
    });
    const previousProject = getCurrentSnapshotProject();
    assertCircleFeatureAlignment(circles, previousProject.featureCollection);
    const nextFeatureCollection = {
      type: 'FeatureCollection',
      features: [...previousProject.featureCollection.features, feature],
    };
    MapCirclesDomain.validateFeatureCollection(nextFeatureCollection);

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

    const previousCircles = circles.slice();
    const previousListDom = captureCircleListDom();
    const previousNextId = nextId;

    try {
      circle.addTo(map);
      marker.addTo(map);
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
      renderList();
      updateCurrentFeatureCollection(nextFeatureCollection);
    } catch (error) {
      circles = previousCircles;
      if (map.hasLayer(marker)) map.removeLayer(marker);
      if (map.hasLayer(circle)) map.removeLayer(circle);
      restoreCircleListDom(previousListDom);
      nextId = previousNextId;
      throw error;
    }

    nextId = previousNextId + 1;
    showStatus(`「${userLabel}」を配置しました（${formatRadius(radius)}）`);

    // 入力リセット
    document.getElementById('label-input').value = '';
    return circles[circles.length - 1];
  }

  function removeCircle(id) {
    const idx = circles.findIndex(c => c.id === id);
    if (idx === -1) return;
    const previousCircles = circles.slice();
    const previousProject = getCurrentSnapshotProject();
    const previousListDom = captureCircleListDom();
    const previousNextId = nextId;
    const target = circles[idx];
    assertCircleFeatureAlignment(circles, previousProject.featureCollection);
    const nextFeatureCollection = {
      type: 'FeatureCollection',
      features: previousProject.featureCollection.features.filter(
        (feature) => feature.id !== target.featureId,
      ),
    };
    MapCirclesDomain.validateFeatureCollection(nextFeatureCollection);

    try {
      map.removeLayer(target.circle);
      map.removeLayer(target.marker);
      circles.splice(idx, 1);
      renderList();
      updateCurrentFeatureCollection(nextFeatureCollection);
    } catch (error) {
      circles = previousCircles;
      if (!map.hasLayer(target.circle)) target.circle.addTo(map);
      if (!map.hasLayer(target.marker)) target.marker.addTo(map);
      restoreCircleListDom(previousListDom);
      nextId = previousNextId;
      throw error;
    }
  }

  function clearAllCircles() {
    const previousCircles = circles.slice();
    const previousProject = getCurrentSnapshotProject();
    const previousListDom = captureCircleListDom();
    const previousNextId = nextId;
    assertCircleFeatureAlignment(circles, previousProject.featureCollection);
    const nextFeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };
    MapCirclesDomain.validateFeatureCollection(nextFeatureCollection);

    try {
      circles.forEach((item) => {
        map.removeLayer(item.circle);
        map.removeLayer(item.marker);
      });
      circles = [];
      renderList();
      updateCurrentFeatureCollection(nextFeatureCollection);
    } catch (error) {
      circles = previousCircles;
      circles.forEach((item) => {
        if (!map.hasLayer(item.circle)) item.circle.addTo(map);
        if (!map.hasLayer(item.marker)) item.marker.addTo(map);
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

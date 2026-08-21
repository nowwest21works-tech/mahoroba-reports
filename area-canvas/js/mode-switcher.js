// ========== 表示モード切替（MapModeSwitcher） ==========
// 「通常地図」は場所確認用の実写タイルそのまま。
// 「白地図」「路線重視」「車移動重視」は、データソースを切り替えるのではなく、
// 同じ実写タイルの不透明度を下げてモノトーン化することで背景を後景化させる。
// これにより行政界・鉄道・道路・河川のベクターレイヤーと、手書き注釈（Marker/Circle/
// Line/Polygon・付箋）が背景と競合せず前に出る。
(() => {
  const modeButtons = document.querySelectorAll('#map-mode-buttons .mode-btn');
  const opacitySlider = document.getElementById('basemap-opacity');
  const opacityVal = document.getElementById('basemap-opacity-val');
  const grayscaleToggle = document.getElementById('basemap-grayscale');
  const stateEl = document.getElementById('map-mode-state');
  const mapContainer = map.getContainer();

  const MODE_PRESETS = {
    real: {
      opacity: 100,
      grayscale: false,
      layers: null,
      label: '通常地図：背景地図をそのまま表示中',
    },
    white: {
      opacity: 20,
      grayscale: true,
      layers: null,
      label: '白地図：背景地図を薄くモノトーン化。手書き・付箋を目立たせています',
    },
    rail: {
      opacity: 20,
      grayscale: true,
      layers: { railway: true, road: false },
      label: '路線重視：背景を薄くし、鉄道路線・駅を優先表示',
    },
    road: {
      opacity: 20,
      grayscale: true,
      layers: { railway: false, road: true },
      label: '車移動重視：背景を薄くし、道路を優先表示',
    },
  };

  function setOpacity(value) {
    baseTileLayer.setOpacity(value / 100);
    opacitySlider.value = String(value);
    opacityVal.textContent = `${value}%`;
  }

  function setGrayscale(enabled) {
    mapContainer.classList.toggle('basemap-grayscale', enabled);
    grayscaleToggle.checked = enabled;
  }

  function clearActiveButtons() {
    modeButtons.forEach((btn) => {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    });
  }

  function applyLayerHint(layers) {
    if (!layers) return;
    Object.entries(layers).forEach(([key, enabled]) => {
      const checkbox = document.querySelector(`[data-base-layer="${key}"]`);
      if (checkbox && !checkbox.disabled && checkbox.checked !== enabled) {
        checkbox.checked = enabled;
        checkbox.dispatchEvent(new Event('change'));
      }
    });
  }

  function activateMode(modeKey) {
    const preset = MODE_PRESETS[modeKey];
    if (!preset) return;
    clearActiveButtons();
    const activeBtn = document.querySelector(`#map-mode-buttons [data-mode="${modeKey}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.setAttribute('aria-pressed', 'true');
    }
    setOpacity(preset.opacity);
    setGrayscale(preset.grayscale);
    applyLayerHint(preset.layers);
    stateEl.textContent = preset.label;
    showStatus(preset.label.split('：')[0] + 'に切り替えました');
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateMode(btn.dataset.mode));
  });

  opacitySlider.addEventListener('input', () => {
    clearActiveButtons();
    setOpacity(Number(opacitySlider.value));
    stateEl.textContent = `カスタム：背景地図の不透明度 ${opacitySlider.value}%`;
  });

  grayscaleToggle.addEventListener('change', () => {
    clearActiveButtons();
    setGrayscale(grayscaleToggle.checked);
    stateEl.textContent = `カスタム：モノトーン化 ${grayscaleToggle.checked ? 'ON' : 'OFF'}`;
  });

  // 初期状態は「通常地図」
  setOpacity(100);
  setGrayscale(false);
})();

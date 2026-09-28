(() => {
  const domain = DeepTimeDomain;
  const master = document.getElementById('deep-time-enabled');
  const controls = document.getElementById('deep-time-controls');
  const status = document.getElementById('deep-time-state');
  const overlayRoot = document.getElementById('deep-time-overlays');
  const opacity = document.getElementById('deep-time-opacity');
  const opacityValue = document.getElementById('deep-time-opacity-val');
  let state = domain.defaultState();
  let manifest = null;
  let manifestPromise = null;

  domain.OVERLAYS.forEach(({ id, title }) => {
    const row = document.createElement('div');
    row.className = 'deep-time-layer';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.deepTimeOverlay = id;
    checkbox.disabled = true;
    const name = document.createElement('span');
    name.textContent = title;
    label.append(checkbox, name);
    const detail = document.createElement('div');
    detail.className = 'deep-time-layer-state';
    detail.textContent = 'データ未接続 · 準備中';
    row.append(label, detail);
    overlayRoot.append(row);
  });

  async function loadManifest() {
    if (manifestPromise) return manifestPromise;
    manifestPromise = fetch('./data/deep-time/manifest.json', { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('manifest取得失敗');
        return response.json();
      })
      .then(domain.validateManifest)
      .catch(() => null);
    return manifestPromise;
  }

  function render() {
    master.checked = state.enabled;
    controls.disabled = !state.enabled;
    opacity.value = String(state.opacity);
    opacityValue.textContent = `${state.opacity}%`;
    document.querySelectorAll('[name="deep-time-era"]').forEach((radio) => {
      radio.checked = radio.value === state.era;
    });
    const selected = domain.effectiveSelection(state, manifest);
    status.textContent = !state.enabled ? 'OFF · データ未接続'
      : !manifest ? 'ON · データ定義を確認できません。地図には表示していません'
        : state.era !== 'present' && selected.era === 'present'
          ? 'ON · 選択した時代は復元データ準備中です。地図には表示していません'
          : 'ON · 現在の地図を表示中。補助レイヤーはデータ未接続です';
    overlayRoot.querySelectorAll('input').forEach((checkbox) => {
      const available = domain.available(manifest, checkbox.dataset.deepTimeOverlay);
      checkbox.disabled = !state.enabled || !available;
      checkbox.checked = available && state.overlays.includes(checkbox.dataset.deepTimeOverlay);
      checkbox.closest('.deep-time-layer').querySelector('.deep-time-layer-state').textContent =
        available ? '利用可能' : 'データ未接続 · 準備中';
    });
  }

  async function apply() {
    render();
    if (!state.enabled) DeepTimeLayers.clear();
    else await DeepTimeLayers.apply(state, manifest);
  }

  master.addEventListener('change', async () => {
    state = domain.normalizeState({ ...state, enabled: master.checked });
    render();
    if (state.enabled) manifest = await loadManifest();
    await apply();
  });
  document.querySelectorAll('[name="deep-time-era"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      state = domain.normalizeState({ ...state, era: radio.value });
      apply();
    });
  });
  overlayRoot.addEventListener('change', (event) => {
    const id = event.target.dataset.deepTimeOverlay;
    if (!id || !domain.available(manifest, id)) return;
    const overlays = new Set(state.overlays);
    if (event.target.checked) overlays.add(id);
    else overlays.delete(id);
    state = domain.normalizeState({ ...state, overlays: [...overlays] });
    apply();
  });
  opacity.addEventListener('input', () => {
    state = domain.normalizeState({ ...state, opacity: opacity.value });
    apply();
  });
  render();
})();

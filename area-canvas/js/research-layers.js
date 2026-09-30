((globalThis) => {
  const PANE_NAME = 'public-research-pane';
  const MANIFEST_URL = './data/research-layers/manifest.json';
  const state = { layers: [], map: null, opacity: 0.65, overlays: new Map(), identifyMode: false, landUseYear: 1997, point: null, evidence: null, requestVersion: 0 };
  const LEGENDS = Object.freeze({
    'landform-classification': {
      url: 'https://www.gsi.go.jp/bousaichiri/fc_index.html',
      source: '国土地理院「治水地形分類図」',
      lines: [
        '主な分類：扇状地・自然堤防・旧河道・後背湿地など。',
        '治水地形分類図は主に平野部を対象に、詳細な地形分類や河川管理施設を示します。',
        '図ごとに整備範囲があります。公式資料で分類と図郭を確認してください。',
      ],
    },
    'meiji-lowland': {
      url: 'https://web1.gsi.go.jp/bousaichiri/lc_meiji_00001.html',
      source: '国土地理院「明治期の低湿地データ」',
      lines: [
        '区分：砂礫地・泥地・泥炭地・湿地・干潟／砂浜・河川／湖沼／海面・田・深田など。',
        '明治期の地図から当時の低湿地等を抽出した資料です。位置誤差を含む場合があります。',
        '現在の災害危険区域を示すものではありません。',
      ],
    },
    'seamless-geology': {
      url: 'https://gbank.gsj.jp/seamless/v2/legend.html',
      source: '産総研 地質調査総合センター「20万分の1日本シームレス地質図V2」',
      lines: [
        '凡例の大分類：堆積岩・付加体・火成岩・変成岩・その他。',
        'クリック地点の詳細凡例は「この地点を調べる」をONにするとGSJ Web APIから取得します。',
        '縮尺は20万分の1です。敷地境界レベルの判定には使用しません。',
      ],
    },
    'gsi-hillshade': {
      url: 'https://maps.gsi.go.jp/help/intro/looklist/3-hyoko.html', source: '国土地理院「陰影起伏図」',
      lines: ['標高タイルから作成した地形の陰影表現です。', '陰影は地形の見え方を助ける資料で、標高値そのものではありません。'],
    },
    'gsi-relief': {
      url: 'https://maps.gsi.go.jp/help/intro/looklist/3-hyoko.html', source: '国土地理院「色別標高図」',
      lines: ['公式の色別標高表現を表示します。', '地点標高は色から読まず、「この地点を調べる」で公式DEMを照会してください。'],
    },
    'gsi-slope': {
      url: 'https://www.gsi.go.jp/bousaichiri/slopemap.html', source: '国土地理院「傾斜量図」',
      lines: ['基盤地図情報数値標高モデル由来の地表傾斜表現です。', '傾斜量図は斜面災害の危険度判定ではありません。'],
    },
    'chubu-land-use': {
      url: 'https://maps.gsi.go.jp/development/ichiran.html', source: '国土地理院「細密数値情報（宅地利用動向調査）」',
      lines: ['中部圏の1977・1982・1987・1991・1997年を単一選択で表示します。', '各時点の土地利用状況を確認する資料です。現在の土地利用や用途地域を示しません。'],
    },
  });

  function addExternalLink(parent, url, text, className) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = text;
    if (className) link.className = className;
    parent.append(link);
    return link;
  }

  function setStatus(id, text, kind = 'normal') {
    const element = document.querySelector(`[data-research-state="${id}"]`);
    if (!element) return;
    element.textContent = text;
    element.dataset.kind = kind;
  }

  function setAllUnavailable(message) {
    document.querySelectorAll('[data-research-layer]').forEach((input) => {
      input.checked = false;
      input.disabled = true;
    });
    const yearSelect = document.getElementById('chubu-land-use-year');
    if (yearSelect) yearSelect.disabled = true;
    const opacity = document.getElementById('research-opacity');
    if (opacity) opacity.disabled = true;
    const identify = document.getElementById('geology-identify-mode');
    if (identify) identify.disabled = true;
    const stateElement = document.getElementById('research-layers-state');
    if (stateElement) {
      stateElement.textContent = message;
      stateElement.dataset.kind = 'error';
    }
  }

  function renderRows(layers, containerId = 'research-layer-list') {
    const container = document.getElementById(containerId);
    if (!container) return false;
    container.replaceChildren();
    layers.forEach((layer) => {
      const row = document.createElement('div');
      row.className = 'research-layer-item';
      const label = document.createElement('label');
      label.className = 'research-layer-row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.researchLayer = layer.id;
      input.setAttribute('aria-describedby', `research-state-${layer.id}`);
      const title = document.createElement('span');
      title.className = 'research-layer-title';
      title.textContent = layer.title;
      const authority = document.createElement('small');
      authority.className = 'research-layer-authority';
      authority.textContent = `${layer.authority}候補`;
      label.append(input, title, authority);
      const legendData = LEGENDS[layer.id];
      const legend = document.createElement('details');
      legend.className = 'research-layer-info research-layer-legend';
      const legendSummary = document.createElement('summary');
      legendSummary.textContent = '凡例を見る';
      const legendList = document.createElement('ul');
      legendList.className = 'research-layer-legend-list';
      legendData.lines.forEach((line) => {
        const item = document.createElement('li');
        item.textContent = line;
        legendList.append(item);
      });
      const legendSource = document.createElement('p');
      legendSource.className = 'research-layer-source';
      legendSource.append(document.createTextNode(`公式凡例・解説：${legendData.source} `));
      addExternalLink(legendSource, legendData.url, '公式資料', 'research-layer-legend-link');
      legend.append(legendSummary, legendList, legendSource);
      const info = document.createElement('details');
      info.className = 'research-layer-info';
      const summary = document.createElement('summary');
      summary.textContent = '情報・出典';
      const description = document.createElement('p');
      description.className = 'research-layer-caution';
      description.textContent = layer.caution;
      const source = document.createElement('p');
      source.className = 'research-layer-source';
      source.append(document.createTextNode(`出典：${layer.sourceOrg}「${layer.sourceTitle}」 `));
      const link = document.createElement('a');
      link.className = 'research-layer-source-link';
      link.href = layer.sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '公式資料';
      source.append(link);
      const terms = document.createElement('p');
      terms.className = 'research-layer-source';
      terms.append(document.createTextNode('利用条件：'));
      const termsLink = document.createElement('a');
      termsLink.className = 'research-layer-terms-link';
      termsLink.href = layer.termsUrl;
      termsLink.target = '_blank';
      termsLink.rel = 'noopener noreferrer';
      termsLink.textContent = '公式利用条件';
      terms.append(termsLink);
      info.append(summary, description, source, terms);
      const status = document.createElement('div');
      status.id = `research-state-${layer.id}`;
      status.className = 'research-layer-state';
      status.dataset.researchState = layer.id;
      status.setAttribute('aria-live', 'polite');
      status.textContent = 'OFF';
      const resolution = document.createElement('p');
      resolution.className = 'research-layer-resolution-note';
      resolution.dataset.researchResolution = layer.id;
      resolution.textContent = '原典の最大解像度を拡大表示しています。敷地境界レベルの精密判定には使用しません。';
      resolution.hidden = true;
      row.append(label, legend, info, status);
      if (layer.id === 'seamless-geology') row.append(resolution);
      container.append(row);
    });
    return true;
  }

  function inRange(layer) {
    return ResearchLayersDomain.canDisplayAtZoom(layer, state.map.getZoom(), state.map.getMaxZoom());
  }

  function removeOverlay(id) {
    const overlay = state.overlays.get(id);
    if (overlay && state.map.hasLayer(overlay.layer)) state.map.removeLayer(overlay.layer);
  }

  function tileUrlFor(layer) {
    return layer.id === 'chubu-land-use'
      ? ResearchLayersDomain.tileUrlForYear(layer, state.landUseYear)
      : layer.tileUrl;
  }

  function updateHealth(id) {
    const overlay = state.overlays.get(id);
    if (!overlay || !state.map.hasLayer(overlay.layer)) return;
    const currentTiles = Object.entries(overlay.layer._tiles || {}).filter(([, tile]) => tile.current);
    let counts = overlay;
    if (currentTiles.length) {
      const visible = { loaded: 0, failed: 0, pending: 0 };
      const visibleKeys = new Set(currentTiles.map(([key]) => key));
      overlay.tileStates.forEach((value, key) => {
        if (!visibleKeys.has(key)) overlay.tileStates.delete(key);
      });
      currentTiles.forEach(([key]) => {
        const tileState = overlay.tileStates.get(key);
        if (tileState === 'READY') visible.loaded += 1;
        else if (tileState === 'FAILED') visible.failed += 1;
        else visible.pending += 1;
      });
      counts = visible;
    }
    const health = ResearchLayersDomain.summarizeTileHealth(counts);
    overlay.health = health;
    if (health === 'LOADING') setStatus(id, '読み込み中…', 'normal');
    if (health === 'READY') setStatus(id, '表示中', 'success');
    if (health === 'PARTIAL') setStatus(id, '一部範囲では表示できない場合があります', 'warning');
    if (health === 'UNAVAILABLE') setStatus(id, 'タイルを取得できませんでした。この表示範囲では地図資料を確認できません', 'error');
    updateResolutionNote(id);
    renderInspector();
  }

  function updateResolutionNote(id) {
    const note = document.querySelector(`[data-research-resolution="${id}"]`);
    if (note) note.hidden = !(id === 'seamless-geology' && state.map.getZoom() > 13);
  }

  function identifyResult(message, fields) {
    const output = document.getElementById('geology-identify-result');
    if (!output) return;
    output.replaceChildren();
    output.hidden = false;
    if (message) {
      output.textContent = message;
      return;
    }
    fields.forEach((group) => {
      const section = document.createElement('section');
      section.className = 'map-inspector-result-group';
      const heading = document.createElement('h4');
      heading.textContent = group.title;
      section.append(heading);
      const hazardDisplay = group.hazardDisplay || group.floodDisplay;
      if (hazardDisplay) {
        const appendLines = (parent, lines) => lines.forEach((value) => {
          const line = document.createElement('p');
          line.textContent = value;
          parent.append(line);
        });
        appendLines(section, [`Status：${group.status}`, ...hazardDisplay.overview]);
        const fold = (title, lines) => {
          const details = document.createElement('details');
          details.className = 'research-layer-info';
          const summary = document.createElement('summary');
          summary.textContent = title;
          details.append(summary);
          appendLines(details, lines);
          section.append(details);
          return details;
        };
        fold(hazardDisplay.detailsTitle || '河川ごとの詳細', hazardDisplay.details.length
          ? hazardDisplay.details : ['確認できた該当Featureの詳細はありません。']);
        const evidence = fold('Evidence・出典・注意事項', hazardDisplay.evidence);
        (group.floodSourceLinks || []).forEach((link) => {
          const source = document.createElement('p');
          source.className = 'research-layer-source';
          addExternalLink(source, link.url, link.label);
          evidence.append(source);
        });
        output.append(section);
        return;
      }
      group.lines.forEach((value) => {
        const line = document.createElement('p');
        line.textContent = value;
        section.append(line);
      });
      const links = group.links || (group.link ? [group.link] : []);
      links.forEach((link) => {
        const source = document.createElement('p');
        source.className = 'research-layer-source';
        addExternalLink(source, link.url, link.label);
        section.append(source);
      });
      output.append(section);
    });
  }

  async function identifyGeology(latlng) {
    const geologyInput = document.querySelector('[data-research-layer="seamless-geology"]');
    if (!geologyInput?.checked) return { title: '地質（GSJ）', status: 'UNAVAILABLE', lines: ['地質図レイヤーがOFFのため照会していません。'], link: { url: LEGENDS['seamless-geology'].url, label: 'GSJ公式凡例' } };
    try {
      const point = `${latlng.lat},${latlng.lng}`;
      const url = `https://gbank.gsj.jp/seamless/v2/api/1.3.1/legend.json?point=${encodeURIComponent(point)}`;
      const response = await globalThis.fetch(url);
      if (!response.ok) throw new Error('request failed');
      const data = await response.json();
      const fields = [
        ['地質年代', data?.formationAge_ja],
        ['地質区分', data?.group_ja],
        ['岩相', data?.lithology_ja],
        ['凡例', data?.title],
      ].filter(([, value]) => typeof value === 'string' && value.trim());
      if (!data || typeof data !== 'object' || Array.isArray(data) || fields.length === 0) throw new Error('unknown legend');
      return {
        title: '地質分類（産総研GSJ・地点別Web API）',
        status: fields.length === 4 ? 'READY' : 'PARTIAL',
        lines: fields.map(([label, value]) => `${label}：${value}`),
        link: { url: 'https://gbank.gsj.jp/seamless/v2/api/1.3.1/', label: '出典：産総研GSJ Web API' },
      };
    } catch {
      return { title: '地質分類（産総研GSJ）', status: 'UNAVAILABLE', lines: ['この地点の地質情報を確認できませんでした。応答なし・未知の凡例は補完しません。'], link: { url: 'https://gbank.gsj.jp/seamless/v2/api/1.3.1/', label: 'GSJ Web API' } };
    }
  }

  async function identifyTerrain(latlng) {
    const result = await TerrainIdentify.identify(state.map, latlng);
    const source = { url: result.sourceUrl, label: '出典：国土地理院 ベクトルタイル「地形分類」' };
    if (result.classification) {
      const item = result.classification;
      const lines = [item.name ? `地形分類：${item.name}` : `地形分類名は未確認（公式コード：${item.code}）`];
      if (item.genesis) lines.push(`土地の成り立ち：${item.genesis}`);
      if (item.risk) lines.push(`地形から見た一般的な自然災害リスク：${item.risk}`);
      lines.push('これは地形分類項目ごとの一般的な傾向で、個別地点の危険度判定ではありません。');
      if (result.status === 'PARTIAL') lines.push('自然地形・人工地形タイルの一部を取得できませんでした。表示内容は取得できた公式データに限ります。');
      return { title: '地形分類（国土地理院・ベクトル資料）', status: item.name ? DecisionInspectorDomain.normalizeStatus(result.status) : 'PARTIAL', lines, link: source };
    }
    const message = result.status === 'NO_FEATURE'
      ? 'この地点の地形分類データは見つかりませんでした。未整備・範囲外の可能性があり、安全や該当地形なしを意味しません。'
      : 'この地点の地形分類を確認できませんでした。公式タイルの取得または応答を確認できません。';
    return { title: '地形分類（国土地理院・ベクトル資料）', status: DecisionInspectorDomain.normalizeStatus(result.status), lines: [message], link: source };
  }

  async function identifyElevation(latlng) {
    const sourceLink = {
      url: 'https://maps.gsi.go.jp/development/elevation.html',
      label: '出典：国土地理院 基盤地図情報数値標高モデル',
    };
    const result = await ElevationIdentify.identify(state.map, latlng);
    if (result.value === null) {
      const message = result.status === 'NO_DATA'
        ? 'この地点の標高値を確認できませんでした。公式DEMの値なし・提供範囲外等の可能性があり、地点の状態は判定できません。'
        : 'この地点の標高タイルを取得できず、値を確認できませんでした。';
      return { title: '地点標高（国土地理院DEM）', status: result.status, lines: [message, 'DEM種別：未確認', '元データ：この地点で値を取得できたDEMなし'], link: sourceLink };
    }
    const lines = [
      `標高：約 ${result.value.toFixed(result.dem.decimals)} m`,
      `DEM種別：${result.dem.id}`,
      `元データ：${result.dem.source}`,
    ];
    if (result.status === 'PARTIAL') lines.push('高解像度候補を一部取得できず、取得できたDEM値を表示しています。');
    return { title: '地点標高（国土地理院DEM）', status: result.status, lines, link: sourceLink };
  }

  function displayContext() {
    const groups = [];
    const selected = state.layers.filter((layer) =>
      document.querySelector(`[data-research-layer="${layer.id}"]`)?.checked);
    groups.push({ title: '現在の表示Context · Research Layer', lines: selected.length
      ? selected.map((layer) => `${layer.title}：${document.querySelector(`[data-research-state="${layer.id}"]`)?.textContent || '未確認'} · ${layer.authority}候補`)
      : ['選択なし'] });
    groups.push({ title: '宅地利用年代', lines: [`選択年代：${state.landUseYear}年 · ${selected.some((layer) => layer.id === 'chubu-land-use') ? 'ON' : 'OFF'}`, '過去の資料です。現在の土地利用・地点分類は判定していません。'] });
    const hazards = Array.from(document.querySelectorAll('[data-hazard]:checked'));
    groups.push({ title: 'Hazard Layer', lines: hazards.length
      ? hazards.map((input) => `${input.closest('label').querySelector('.hazard-name').textContent}（${input.closest('label').querySelector('.hazard-tag').textContent}）：選択ON（取得状況・地点該当は未確認）`)
      : ['選択なし'], link: { url: 'https://disaportal.gsi.go.jp/', label: 'ハザードマップポータル' } });
    groups.push({ title: '都市計画Layer', lines: [document.getElementById('urban-area-classification-state').textContent, '参照資料：都市計画決定GISデータ（2025年度）XKT001加工。地点の区域区分は照会していません。'], link: { url: 'https://www.reinfolib.mlit.go.jp/help/apiManual/xkt001/', label: '国土交通省 XKT001資料' } });
    const era = document.querySelector('[name="deep-time-era"]:checked');
    groups.push({ title: 'Deep Time state', lines: [document.getElementById('deep-time-state').textContent, `選択時代：${era?.closest('label').textContent.trim() || '未確認'}`, '復元データ・補助レイヤーは未接続。地点Evidenceはありません。'], link: { url: './data/deep-time/README.md', label: 'Deep Time資料・Authority方針' } });
    selected.forEach((layer) => groups.push({ title: `参照資料：${layer.title}`, lines: [], link: { url: layer.sourceUrl, label: `${layer.sourceOrg}「${layer.sourceTitle}」` } }));
    return groups;
  }

  function renderInspector() {
    if (!state.identifyMode || !state.point || !state.evidence) return;
    const context = displayContext();
    const evidence = state.evidence.map((group) => ({ ...group,
      lines: [`Status：${DecisionInspectorDomain.normalizeStatus(group.status)}`, ...group.lines], floodSourceLinks: (group.hazardDisplay || group.floodDisplay) ? group.links : null, link: null, links: null }));
    const sources = [...state.evidence, ...context].flatMap((group) =>
      ((group.hazardDisplay || group.floodDisplay) ? [] : (group.links || (group.link ? [group.link] : [])))
        .map((link) => ({ ...link, label: `${group.title}：${link.label}` })));
    identifyResult('', [
      { title: 'Decision Inspector · 地点', lines: [
        `緯度：${state.point.lat.toFixed(6)} / 経度：${state.point.lng.toFixed(6)}`,
        `Evidence Status：${DecisionInspectorDomain.summarizeStatus(state.evidence.map((group) => group.status))}`,
        '以下はこの地点をクリックした時の照会結果です。表示Contextは現在の操作に追従します。',
      ] },
      ...evidence,
      ...context.filter((group) => group.lines.length).map((group) => ({ ...group, link: null })),
      { title: '出典・参照資料', lines: [], links: sources },
      { title: '注意事項', lines: [
        'READYは資料の取得状態です。安全・危険・購入推奨を意味しません。',
        'NO_DATAは公式資料で値・地形を確認できない状態です。該当なしとは判定しません。',
        '洪水・高潮・津波・土砂は公式Vectorで地点照会します。都市計画・宅地利用は表示Contextのみです。ラスター色から意味を判定しません。',
        '地質図は20万分の1の資料です。正式な区域は自治体資料、地盤は現地調査で確認してください。',
        '地形分類・DEM・地質はEVIDENCE。Deep TimeのRECONSTRUCTION / ILLUSTRATIONとは分けて扱います。',
      ] },
    ]);
  }

  async function identifyPoint(latlng) {
    const version = ++state.requestVersion;
    state.point = { lat: latlng.lat, lng: latlng.lng };
    state.evidence = null;
    identifyResult(`緯度：${latlng.lat.toFixed(6)} / 経度：${latlng.lng.toFixed(6)} · 資料を確認しています…`, []);
    const sections = await Promise.allSettled([identifyTerrain(latlng), identifyElevation(latlng), identifyGeology(latlng), globalThis.FloodIdentify
      ? FloodIdentify.identify(latlng).then(FloodIdentifyDomain.toGroup)
      : Promise.resolve({ title: '洪水浸水想定｜想定最大規模', status: 'UNAVAILABLE', lines: ['Local Pilot providerを利用できません。'] }),
      ...['storm-surge', 'tsunami'].map((kind) => globalThis.CoastalIdentify
        ? CoastalIdentify[kind === 'storm-surge' ? 'stormSurge' : 'tsunami'].identify(latlng).then((result) => CoastalIdentifyDomain.toGroup(kind, result))
        : Promise.resolve({ title: kind === 'storm-surge' ? '高潮浸水想定' : '津波浸水想定', status: 'UNAVAILABLE', lines: ['Local Pilot providerを利用できません。'] })),
      globalThis.LandslideIdentify ? LandslideIdentify.identify(latlng).then(LandslideIdentifyDomain.toGroup)
        : Promise.resolve({ title: '土砂災害', status: 'UNAVAILABLE', lines: ['Local Pilot providerを利用できません。'] }),
    ]);
    if (!DecisionInspectorDomain.acceptResult(version, state.requestVersion, state.identifyMode)) return;
    state.evidence = sections.map((result, index) => result.status === 'fulfilled' ? result.value
      : { title: ['地形分類', '地点標高', '地質', '洪水浸水想定｜想定最大規模', '高潮浸水想定', '津波浸水想定', '土砂災害'][index], status: 'UNAVAILABLE', lines: ['取得できませんでした。値は補完しません。'] });
    renderInspector();
  }

  function handleMapClick(event) {
    if (!state.identifyMode) return false;
    identifyPoint(event.latlng);
    return true;
  }

  function addOverlay(layer) {
    let overlay = state.overlays.get(layer.id);
    if (!overlay) {
      const url = tileUrlFor(layer);
      if (!url) return false;
      const tileLayer = L.tileLayer(url, {
        attribution: layer.attribution,
        crossOrigin: true,
        maxNativeZoom: layer.maxZoom,
        maxZoom: state.map.getMaxZoom(),
        minZoom: layer.minZoom,
        opacity: state.opacity,
        pane: PANE_NAME,
        pmIgnore: true,
        exportRole: 'research',
        researchLayerId: layer.id,
      });
      overlay = { layer: tileLayer, loaded: 0, failed: 0, pending: 0, health: 'LOADING', tileStates: new Map() };
      tileLayer.on('loading', () => {
        overlay.loaded = 0;
        overlay.failed = 0;
        overlay.pending = 0;
        updateHealth(layer.id);
      });
      tileLayer.on('tileloadstart', (event) => {
        overlay.pending += 1;
        overlay.tileStates.set(tileLayer._tileCoordsToKey(event.coords), 'LOADING');
        updateHealth(layer.id);
      });
      tileLayer.on('tileload', (event) => {
        overlay.pending = Math.max(0, overlay.pending - 1);
        overlay.loaded += 1;
        overlay.tileStates.set(tileLayer._tileCoordsToKey(event.coords), 'READY');
        updateHealth(layer.id);
      });
      tileLayer.on('tileerror', (event) => {
        overlay.pending = Math.max(0, overlay.pending - 1);
        overlay.failed += 1;
        overlay.tileStates.set(tileLayer._tileCoordsToKey(event.coords), 'FAILED');
        updateHealth(layer.id);
      });
      tileLayer.on('load', () => globalThis.setTimeout(() => updateHealth(layer.id), 0));
      state.overlays.set(layer.id, overlay);
    }
    if (!state.map.hasLayer(overlay.layer)) overlay.layer.addTo(state.map);
    overlay.layer.getContainer()?.classList.add('public-research-layer-container');
    return true;
  }

  function setOpacity(value) {
    const opacity = Number(value) / 100;
    if (!Number.isFinite(opacity) || opacity < 0.1 || opacity > 1) return;
    state.opacity = opacity;
    state.overlays.forEach(({ layer }) => layer.setOpacity(opacity));
    const output = document.getElementById('research-opacity-value');
    if (output) output.textContent = `${Math.round(opacity * 100)}%`;
  }

  function syncZoom() {
    state.layers.forEach((layer) => {
      const input = document.querySelector(`[data-research-layer="${layer.id}"]`);
      if (!input || !input.checked) return;
      if (inRange(layer)) {
        if (addOverlay(layer)) updateResolutionNote(layer.id);
      } else {
        removeOverlay(layer.id);
        setStatus(layer.id, `対応zoom外（${layer.minZoom}–${layer.maxZoom}）。一時停止中`, 'normal');
      }
    });
  }

  async function initialize({ mapInstance = globalThis.map, fetchImpl = globalThis.fetch } = {}) {
    state.map = mapInstance;
    if (!state.map || typeof fetchImpl !== 'function' || !globalThis.ResearchLayersDomain) {
      setAllUnavailable('レイヤー定義を読み込めません。全レイヤーをOFFにしています。');
      return false;
    }
    try {
      const response = await fetchImpl(MANIFEST_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('manifest fetch failed');
      const manifest = await response.json();
      state.layers = ResearchLayersDomain.validateManifest(manifest);
    } catch {
      setAllUnavailable('レイヤー定義を確認できません。全レイヤーをOFFにしています。');
      return false;
    }

    if (!renderRows(state.layers.filter((layer) => layer.group === 'terrain'))) return false;
    if (!renderRows(state.layers.filter((layer) => layer.group === 'relief'), 'research-relief-layer-list')) return false;
    if (!renderRows(state.layers.filter((layer) => layer.group === 'modern-land-use'), 'research-land-use-layer-list')) return false;
    state.map.createPane(PANE_NAME);
    state.map.getPane(PANE_NAME).style.zIndex = '280';
    state.layers.forEach((layer) => {
      const input = document.querySelector(`[data-research-layer="${layer.id}"]`);
      input.disabled = false;
      input.addEventListener('change', () => {
        if (!input.checked) {
          removeOverlay(layer.id);
          setStatus(layer.id, 'OFF');
          return;
        }
        if (!inRange(layer)) {
          input.checked = false;
          setStatus(layer.id, `対応zoom外（${layer.minZoom}–${layer.maxZoom}）。表示していません`, 'error');
          return;
        }
        if (addOverlay(layer)) {
          const overlay = state.overlays.get(layer.id);
          overlay.loaded = 0;
          overlay.failed = 0;
          overlay.pending = 0;
          overlay.tileStates.clear();
          setStatus(layer.id, '読み込み中…', 'normal');
        } else {
          input.checked = false;
          setStatus(layer.id, '対応zoom外のため表示していません', 'error');
        }
      });
    });

    const landUseYear = document.getElementById('chubu-land-use-year');
    if (landUseYear) {
      landUseYear.value = String(state.landUseYear);
      landUseYear.disabled = false;
      landUseYear.addEventListener('change', () => {
        const layer = ResearchLayersDomain.findLayer(state.layers, 'chubu-land-use');
        const selected = Number(landUseYear.value);
        if (!layer || !ResearchLayersDomain.tileUrlForYear(layer, selected)) {
          landUseYear.value = String(state.landUseYear);
          return;
        }
        state.landUseYear = selected;
        const toggle = document.querySelector('[data-research-layer="chubu-land-use"]');
        if (toggle?.checked && inRange(layer)) {
          removeOverlay(layer.id);
          state.overlays.delete(layer.id);
          addOverlay(layer);
          setStatus(layer.id, `読み込み中…（${state.landUseYear}年）`, 'normal');
        }
      });
    }

    const slider = document.getElementById('research-opacity');
    slider.value = String(Math.round(state.layers[0].opacityDefault * 100));
    slider.disabled = false;
    slider.addEventListener('input', () => setOpacity(slider.value));
    setOpacity(slider.value);
    state.map.on('zoomend', syncZoom);
    const identifyToggle = document.getElementById('geology-identify-mode');
    identifyToggle.disabled = false;
    identifyToggle.addEventListener('change', () => {
      state.identifyMode = identifyToggle.checked;
      const output = document.getElementById('geology-identify-result');
      globalThis.FloodIdentify?.cancel();
      globalThis.CoastalIdentify?.cancel();
      globalThis.LandslideIdentify?.cancel();
      state.requestVersion += 1;
      state.point = null;
      state.evidence = null;
      if (!state.identifyMode && output) output.hidden = true;
      if (state.identifyMode) identifyResult('地図上の地点をクリックしてください。地形分類は独立した公式ベクトル資料を照会します。', []);
    });
    document.getElementById('panel').addEventListener('change', () => globalThis.setTimeout(renderInspector, 0));
    state.map.on('zoomend layeradd layerremove', () => globalThis.setTimeout(renderInspector, 0));
    const contextObserver = new MutationObserver(renderInspector);
    ['urban-area-classification-state', 'deep-time-state'].forEach((id) => contextObserver.observe(document.getElementById(id), { childList: true, characterData: true, subtree: true }));
    const status = document.getElementById('research-layers-state');
    if (status) {
      status.textContent = 'レイヤーは個別にONにしてください。対応zoom外は表示しません。';
      status.dataset.kind = 'normal';
    }
    return true;
  }

  globalThis.ResearchLayers = Object.freeze({
    handleMapClick,
    initialize,
    setOpacity,
  });
})(globalThis);

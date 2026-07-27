// ========== 地図画像・印刷用PDF書き出し ==========
(() => {
  const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);
  const MAX_EXPORT_PIXELS = 8_000_000;
  const TILE_WAIT_TIMEOUT_MS = 10_000;
  const MIN_BASE_COVERAGE = 0.95;
  const MAX_FILE_NAME_LENGTH = 180;
  const TILE_ERROR_MESSAGE = '表示中のベース地図を十分に読み込めませんでした。通信状態や表示位置を確認して、もう一度お試しください。';
  const TILE_TIMEOUT_MESSAGE = '地図タイルの読み込みが時間内に完了しませんでした。通信状態を確認して、もう一度お試しください。';
  const HAZARD_LABELS = Object.freeze({
    flood: '洪水浸水想定区域',
    landslide: '土砂災害警戒区域',
    hightide: '高潮浸水想定区域',
    tsunami: '津波浸水想定区域',
  });

  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function intersectRect(element, mapRect) {
    const rect = element.getBoundingClientRect();
    const intersection = {
      bottom: Math.min(rect.bottom, mapRect.bottom),
      left: Math.max(rect.left, mapRect.left),
      right: Math.min(rect.right, mapRect.right),
      top: Math.max(rect.top, mapRect.top),
    };
    intersection.width = Math.max(0, intersection.right - intersection.left);
    intersection.height = Math.max(0, intersection.bottom - intersection.top);
    return intersection;
  }

  function hasEffectiveVisibility(element, mapElement) {
    let current = element;
    let opacity = 1;
    while (current instanceof Element) {
      const style = getComputedStyle(current);
      if (
        style.display === 'none'
        || style.visibility === 'hidden'
        || style.visibility === 'collapse'
      ) {
        return false;
      }
      const value = Number.parseFloat(style.opacity);
      if (Number.isFinite(value)) opacity *= value;
      if (opacity <= 0) return false;
      if (current === mapElement) break;
      current = current.parentElement;
    }
    return true;
  }

  function unionArea(rectangles) {
    const xValues = Array.from(new Set(
      rectangles.flatMap((rect) => [rect.left, rect.right]),
    )).sort((left, right) => left - right);
    let area = 0;

    for (let index = 0; index < xValues.length - 1; index += 1) {
      const left = xValues[index];
      const right = xValues[index + 1];
      if (right <= left) continue;
      const intervals = rectangles
        .filter((rect) => rect.left < right && rect.right > left)
        .map((rect) => [rect.top, rect.bottom])
        .sort((first, second) => first[0] - second[0]);
      let coveredHeight = 0;
      let start;
      let end;
      intervals.forEach(([top, bottom]) => {
        if (start === undefined) {
          start = top;
          end = bottom;
        } else if (top > end) {
          coveredHeight += end - start;
          start = top;
          end = bottom;
        } else {
          end = Math.max(end, bottom);
        }
      });
      if (start !== undefined) coveredHeight += end - start;
      area += (right - left) * coveredHeight;
    }
    return area;
  }

  function isCurrentTile(layer, record) {
    const tile = record.el;
    if (!(tile instanceof HTMLImageElement) || !tile.isConnected) return false;
    if (!layer._map || layer._tileZoom === undefined) return false;
    if (record.coords?.z !== layer._tileZoom) return false;
    const currentLevel = layer._levels?.[layer._tileZoom]?.el;
    if (!currentLevel || !currentLevel.contains(tile)) return false;
    return tile.closest('.leaflet-tile-container') === currentLevel;
  }

  function getTileLayers(mapInstance) {
    const layers = [];
    mapInstance.eachLayer((layer) => {
      if (
        layer instanceof L.TileLayer
        && layer._map === mapInstance
        && ['base', 'hazard'].includes(layer.options.exportRole)
      ) {
        layers.push(layer);
      }
    });
    return layers;
  }

  function inspectTiles(mapInstance, mapElement) {
    const mapRect = mapElement.getBoundingClientRect();
    const layers = getTileLayers(mapInstance);
    const tiles = [];
    layers.forEach((layer) => {
      Object.values(layer._tiles || {}).forEach((record) => {
        if (!isCurrentTile(layer, record)) return;
        const intersection = intersectRect(record.el, mapRect);
        const intersects = intersection.width > 1 && intersection.height > 1;
        const visible = intersects
          && hasEffectiveVisibility(record.el, mapElement);
        tiles.push({
          failed: record.el.complete && record.el.naturalWidth === 0,
          intersection,
          layer,
          loaded: record.el.complete && record.el.naturalWidth > 0,
          missing: record.el.dataset.tileMissing === 'true',
          role: layer.options.exportRole,
          tile: record.el,
          visible,
        });
      });
    });

    const mapArea = Math.max(1, mapRect.width * mapRect.height);
    const loadedBaseRects = tiles
      .filter((tile) => (
        tile.role === 'base'
        && tile.visible
        && tile.loaded
        && !tile.missing
      ))
      .map((tile) => tile.intersection);
    const baseCoverage = unionArea(loadedBaseRects) / mapArea;
    const baseLayers = layers.filter((layer) => layer.options.exportRole === 'base');
    const hazardLayers = layers.filter((layer) => layer.options.exportRole === 'hazard');
    const basePending = baseLayers.some((layer) => layer.isLoading())
      || tiles.some((tile) => (
        tile.role === 'base'
        && tile.visible
        && !tile.loaded
        && !tile.failed
      ));
    const hazardPending = hazardLayers.some((layer) => layer.isLoading())
      || tiles.some((tile) => (
        tile.role === 'hazard'
        && tile.visible
        && !tile.loaded
        && !tile.failed
      ));
    const hazardPartial = tiles.some((tile) => (
      tile.role === 'hazard' && (tile.failed || tile.missing)
    ));

    return {
      baseCoverage,
      baseLayers,
      basePending,
      hazardPartial,
      hazardPending,
      layers,
      tiles,
    };
  }

  function waitForVisibleTiles(
    mapElement,
    timeoutMs = TILE_WAIT_TIMEOUT_MS,
    mapInstance = globalThis.map,
  ) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId;
      const observed = new Set();
      const observedLayers = new Set();
      const observer = new MutationObserver(check);

      function cleanup() {
        clearTimeout(timeoutId);
        observer.disconnect();
        observed.forEach((image) => {
          image.removeEventListener('load', check);
          image.removeEventListener('error', check);
        });
        observedLayers.forEach((layer) => {
          layer.off('loading tileload tileerror load', check);
        });
      }

      function finish(callback, value) {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      }

      function check(force = false) {
        const timeoutExpired = force === true;
        const inspection = inspectTiles(mapInstance, mapElement);
        inspection.tiles.forEach(({ tile }) => {
          if (observed.has(tile)) return;
          observed.add(tile);
          tile.addEventListener('load', check);
          tile.addEventListener('error', check);
        });
        inspection.layers.forEach((layer) => {
          if (observedLayers.has(layer)) return;
          observedLayers.add(layer);
          layer.on('loading tileload tileerror load', check);
        });

        const baseReady = inspection.baseLayers.length > 0
          && inspection.baseCoverage >= MIN_BASE_COVERAGE;
        if (baseReady && (!inspection.hazardPending || timeoutExpired)) {
          finish(resolve, {
            baseCoverage: inspection.baseCoverage,
            hazardPartial: inspection.hazardPartial || (
              timeoutExpired && inspection.hazardPending
            ),
          });
          return;
        }
        if ((!inspection.basePending || timeoutExpired) && !baseReady) {
          finish(
            reject,
            new Error(timeoutExpired ? TILE_TIMEOUT_MESSAGE : TILE_ERROR_MESSAGE),
          );
        }
      }

      observer.observe(mapElement, {
        childList: true,
        subtree: true,
      });
      timeoutId = setTimeout(() => {
        check(true);
      }, timeoutMs);
      check();
    });
  }

  function calculateScale(mapElement) {
    const rect = mapElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error('地図の表示サイズを取得できませんでした。');
    }
    const preferred = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    const pixelLimited = Math.sqrt(
      MAX_EXPORT_PIXELS / (rect.width * rect.height),
    );
    return Math.max(1, Math.min(preferred, pixelLimited));
  }

  function shouldIgnoreElement(element) {
    return element.classList.contains('map-export-skip-tile') || Boolean(element.closest(
      '#toggle-panel, #status, .leaflet-control-zoom, .leaflet-pm-toolbar, '
      + '.leaflet-pm-draw-marker, .leaflet-pm-edit-marker, '
      + '.leaflet-pm-drag-marker, .leaflet-pm-removal-marker',
    ));
  }

  async function renderMapSnapshot({ mapElement, mapInstance, renderMap }) {
    if (typeof renderMap !== 'function') {
      throw new Error('画像生成機能を読み込めませんでした。ページを再読み込みしてください。');
    }

    const readiness = await waitForVisibleTiles(
      mapElement,
      TILE_WAIT_TIMEOUT_MS,
      mapInstance,
    );
    const skippedHazardTiles = inspectTiles(mapInstance, mapElement).tiles
      .filter((tile) => (
        tile.role === 'hazard'
        && (!tile.loaded || tile.failed || tile.missing)
      ))
      .map(({ tile }) => tile);
    skippedHazardTiles.forEach((tile) => {
      tile.classList.add('map-export-skip-tile');
    });
    mapElement.classList.add('map-export-capturing');
    try {
      await nextPaint();
      const canvas = await renderMap(mapElement, {
        allowTaint: false,
        backgroundColor: '#e8e4dc',
        imageTimeout: TILE_WAIT_TIMEOUT_MS,
        ignoreElements: shouldIgnoreElement,
        logging: false,
        scale: calculateScale(mapElement),
        useCORS: true,
      });
      if (
        !(canvas instanceof HTMLCanvasElement)
        || canvas.width < 1
        || canvas.height < 1
      ) {
        throw new Error('地図画像の生成結果が空でした。');
      }
      return { canvas, readiness };
    } catch (error) {
      if (
        error instanceof Error
        && /taint|cross.?origin|cors|security/i.test(error.message)
      ) {
        throw new Error(
          '外部画像のCORS制限により地図画像を作成できませんでした。表示中のレイヤーを確認してください。',
        );
      }
      if (error instanceof Error && error.message) throw error;
      throw new Error('地図画像を生成できませんでした。');
    } finally {
      skippedHazardTiles.forEach((tile) => {
        tile.classList.remove('map-export-skip-tile');
      });
      mapElement.classList.remove('map-export-capturing');
    }
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.size === 0 || blob.type !== 'image/png') {
          reject(new Error('PNG画像を生成できませんでした。'));
          return;
        }
        resolve(blob);
      }, 'image/png');
    });
  }

  async function validatePngBlob(blob) {
    const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if (
      signature.length !== PNG_SIGNATURE.length
      || PNG_SIGNATURE.some((byte, index) => signature[index] !== byte)
    ) {
      throw new Error('PNG画像の内容を確認できませんでした。');
    }
  }

  function normalizeFileSegment(value, fallback) {
    const normalized = String(value || '')
      .normalize('NFKC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/[. ]+$/g, '')
      .replace(/^[_ .]+|[_ .]+$/g, '')
      .slice(0, 40);
    return normalized || fallback;
  }

  function formatTimestamp(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      '-',
      pad(date.getHours()),
      pad(date.getMinutes()),
    ].join('');
  }

  function formatCreatedAt(date) {
    return new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function createPngFileName(metadata, now = new Date()) {
    const parts = [
      'mahoroba-map',
      normalizeFileSegment(metadata.householdCode, 'code'),
      normalizeFileSegment(metadata.journeyName, 'journey'),
      normalizeFileSegment(metadata.mapProjectName, 'map'),
      formatTimestamp(now),
    ];
    const extension = '.png';
    return `${parts.join('_').slice(0, MAX_FILE_NAME_LENGTH - extension.length)}${extension}`;
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function readMetadata(elements) {
    return {
      householdCode: elements.householdCode.value.trim(),
      journeyName: elements.journeyName.value.trim(),
      mapProjectName: elements.mapProjectName.value.trim(),
    };
  }

  function readActiveHazards() {
    return Array.from(
      document.querySelectorAll('input[data-hazard]:checked'),
    ).map((input) => HAZARD_LABELS[input.dataset.hazard] || input.dataset.hazard);
  }

  function countFeatures(featureCollection) {
    const counts = {
      circle: 0,
      line: 0,
      marker: 0,
      polygon: 0,
    };
    featureCollection.features.forEach((feature) => {
      if (Object.hasOwn(counts, feature.properties.kind)) {
        counts[feature.properties.kind] += 1;
      }
    });
    return counts;
  }

  function appendTextElement(parent, tagName, text, className) {
    const element = parent.ownerDocument.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function addDefinition(document, list, term, description) {
    appendTextElement(list, 'dt', term);
    appendTextElement(list, 'dd', description || '未入力');
  }

  function createPrintStyles(document) {
    const style = document.createElement('style');
    style.textContent = `
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; color: #1a1a1a; font-family: sans-serif; }
      body { background: #fff; }
      .print-sheet {
        width: 100%; min-height: 100%; display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto; gap: 4mm;
        break-inside: avoid; page-break-inside: avoid;
      }
      .print-header { display: grid; grid-template-columns: 1fr auto; gap: 8mm; }
      h1 { margin: 0 0 2mm; font-size: 16pt; }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 1mm 3mm; margin: 0; font-size: 8.5pt; }
      dt { color: #666; } dd { margin: 0; overflow-wrap: anywhere; }
      .counts { text-align: right; font-size: 8.5pt; line-height: 1.55; }
      .map-image { display: block; width: 100%; height: 134mm; object-fit: contain; background: #e8e4dc; }
      .print-footer { display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; font-size: 7.5pt; line-height: 1.45; color: #555; }
      .print-footer h2 { margin: 0 0 1mm; font-size: 8pt; color: #1a1a1a; }
      .print-footer p { margin: 0; }
      @media screen {
        body { padding: 10mm; background: #e8e4dc; }
        .print-sheet { max-width: 277mm; margin: auto; padding: 10mm; background: #fff; }
      }
      @media print {
        body { width: 277mm; height: 190mm; }
        .print-sheet { height: 190mm; }
        .map-image { height: 100%; min-height: 0; }
      }
    `;
    document.head.append(style);
  }

  function showPrintError(printWindow, error) {
    const { document } = printWindow;
    document.head.replaceChildren();
    document.body.replaceChildren();
    document.documentElement.lang = 'ja';
    const charset = document.createElement('meta');
    charset.setAttribute('charset', 'UTF-8');
    document.head.append(charset);
    document.title = '地図を書き出せませんでした';
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; font-family: sans-serif; color: #1a1a1a; }
      body { display: grid; place-items: center; padding: 24px; background: #f1eee8; }
      .print-error-card { width: min(100%, 520px); padding: 24px; border: 1px solid #d7d0c5;
        border-radius: 12px; background: #fff; box-shadow: 0 8px 24px rgb(0 0 0 / 8%); }
      h1 { margin: 0 0 12px; font-size: 20px; }
      p { margin: 0 0 12px; line-height: 1.65; }
      .print-error-reason { color: #9b2c2c; }
      button { min-height: 44px; margin-top: 4px; padding: 0 18px; border: 0;
        border-radius: 8px; background: #2f5d50; color: #fff; font: inherit; cursor: pointer; }
    `;
    document.head.append(style);
    const card = document.createElement('main');
    card.className = 'print-error-card';
    appendTextElement(card, 'h1', '地図を書き出せませんでした');
    appendTextElement(
      card,
      'p',
      error instanceof Error && error.message
        ? error.message
        : '印刷用画面を生成できませんでした。',
      'print-error-reason',
    );
    appendTextElement(
      card,
      'p',
      '元の地図画面へ戻り、表示位置や通信状態を確認してから、もう一度お試しください。',
    );
    const closeButton = appendTextElement(card, 'button', 'この画面を閉じる');
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => printWindow.close());
    document.body.append(card);
  }

  function showPrintDocument({
    canvas,
    counts,
    hazards,
    metadata,
    printWindow,
  }) {
    const { document } = printWindow;
    document.head.replaceChildren();
    document.body.replaceChildren();
    document.documentElement.lang = 'ja';
    const charset = document.createElement('meta');
    charset.setAttribute('charset', 'UTF-8');
    document.head.append(charset);
    document.title = `まほろば顧客条件マップ_${metadata.mapProjectName || '地図'}`;
    createPrintStyles(document);

    const sheet = document.createElement('main');
    sheet.className = 'print-sheet';

    const header = document.createElement('header');
    header.className = 'print-header';
    const headingGroup = document.createElement('div');
    appendTextElement(headingGroup, 'h1', 'まほろば顧客条件マップ');
    const metadataList = document.createElement('dl');
    metadataList.className = 'metadata';
    addDefinition(document, metadataList, '顧客コード', metadata.householdCode);
    addDefinition(document, metadataList, '案件名', metadata.journeyName);
    addDefinition(document, metadataList, '地図名', metadata.mapProjectName);
    addDefinition(document, metadataList, '作成日時', formatCreatedAt(new Date()));
    headingGroup.append(metadataList);
    header.append(headingGroup);
    appendTextElement(
      header,
      'div',
      `地点・メモ ${counts.marker} ／ 円 ${counts.circle} ／ 線 ${counts.line} ／ 範囲 ${counts.polygon}`,
      'counts',
    );
    sheet.append(header);

    const mapImage = document.createElement('img');
    mapImage.className = 'map-image';
    mapImage.alt = '現在表示中の地図';
    mapImage.src = canvas.toDataURL('image/png');
    sheet.append(mapImage);

    const footer = document.createElement('footer');
    footer.className = 'print-footer';
    const hazardBlock = document.createElement('section');
    appendTextElement(hazardBlock, 'h2', '表示中のハザード情報');
    appendTextElement(
      hazardBlock,
      'p',
      hazards.length > 0 ? hazards.join('、') : 'なし',
    );
    footer.append(hazardBlock);
    const cautionBlock = document.createElement('section');
    appendTextElement(cautionBlock, 'h2', '注意・出典');
    appendTextElement(
      cautionBlock,
      'p',
      '地図・ハザード情報は参考資料です。必ず現地確認と自治体公表資料との照合を行ってください。'
      + ' 地図 © OpenStreetMap contributors ／ ハザード情報 © 国土交通省',
    );
    footer.append(cautionBlock);
    sheet.append(footer);
    document.body.append(sheet);

    return new Promise((resolve, reject) => {
      let printStarted = false;
      const print = () => {
        if (printStarted) return;
        printStarted = true;
        printWindow.focus();
        printWindow.print();
        resolve();
      };
      mapImage.addEventListener('load', print, { once: true });
      mapImage.addEventListener('error', () => {
        reject(new Error('印刷用の地図画像を表示できませんでした。'));
      }, { once: true });
      if (mapImage.complete) {
        if (mapImage.naturalWidth > 0) print();
        else reject(new Error('印刷用の地図画像を表示できませんでした。'));
      }
    });
  }

  function initialize({
    captureProjectState,
    mapInstance,
    renderMap,
  }) {
    const elements = {
      exportPng: document.getElementById('export-map-png'),
      exportPdf: document.getElementById('export-map-pdf'),
      exportState: document.getElementById('map-export-state'),
      householdCode: document.getElementById('household-code'),
      journeyName: document.getElementById('journey-name'),
      mapElement: document.getElementById('map'),
      mapProjectName: document.getElementById('map-project-name'),
    };
    let busy = false;

    function setBusy(value) {
      busy = value;
      elements.exportPng.disabled = value;
      elements.exportPdf.disabled = value;
      elements.exportPng.setAttribute('aria-busy', String(value));
      elements.exportPdf.setAttribute('aria-busy', String(value));
    }

    function setState(message, kind = 'normal') {
      elements.exportState.textContent = message;
      elements.exportState.dataset.kind = kind;
    }

    async function runExport(task) {
      if (busy) return;
      setBusy(true);
      try {
        await task();
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : '地図を書き出せませんでした。';
        setState(message, 'error');
        showStatus(message, 5000);
      } finally {
        setBusy(false);
      }
    }

    elements.exportPng.addEventListener('click', () => {
      runExport(async () => {
        setState('地図タイルの読込を確認しています');
        mapInstance.closePopup();
        const { canvas, readiness } = await renderMapSnapshot({
          mapElement: elements.mapElement,
          mapInstance,
          renderMap,
        });
        const blob = await canvasToPngBlob(canvas);
        await validatePngBlob(blob);
        const fileName = createPngFileName(readMetadata(elements));
        downloadBlob(blob, fileName);
        const warning = readiness.hazardPartial
          ? '（一部のハザードタイルは提供範囲外のため省略）'
          : '';
        setState(`PNG画像を保存しました：${fileName}${warning}`, 'success');
      });
    });

    elements.exportPdf.addEventListener('click', () => {
      if (busy) return;
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setState('印刷画面を開けませんでした。ポップアップを許可して、もう一度お試しください。', 'error');
        return;
      }
      appendTextElement(
        printWindow.document.body,
        'p',
        '印刷用の地図画像を準備しています。',
      );
      runExport(async () => {
        setState('地図タイルの読込を確認しています');
        mapInstance.closePopup();
        try {
          const { canvas, readiness } = await renderMapSnapshot({
            mapElement: elements.mapElement,
            mapInstance,
            renderMap,
          });
          const state = captureProjectState();
          await showPrintDocument({
            canvas,
            counts: countFeatures(state.featureCollection),
            hazards: readActiveHazards(),
            metadata: readMetadata(elements),
            printWindow,
          });
          setState('印刷画面を開きました。保存先で「PDFに保存」を選んでください。', 'success');
          if (readiness.hazardPartial) {
            setState(
              '印刷画面を開きました。一部のハザードタイルは提供範囲外のため省略しています。',
              'success',
            );
          }
        } catch (error) {
          showPrintError(printWindow, error);
          throw error;
        }
      });
    });
  }

  globalThis.JourneyMapExport = Object.freeze({
    createPngFileName,
    initialize,
    waitForVisibleTiles,
  });
})();

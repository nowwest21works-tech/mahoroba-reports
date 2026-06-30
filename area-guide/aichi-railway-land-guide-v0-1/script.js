(function () {
  const routeSummary = document.querySelector("#route-summary");
  const geographicMap = document.querySelector("#geographic-map");
  const geoMapLegend = document.querySelector("#geo-map-legend");
  const routeMap = document.querySelector("#route-map");
  const routeMapFallback = document.querySelector("#route-map-fallback");
  const geographicViewButton = document.querySelector("#map-view-geographic");
  const diagramViewButton = document.querySelector("#map-view-diagram");
  const routeSections = document.querySelector("#route-sections");
  const routeCount = document.querySelector("#route-count");
  const stationCount = document.querySelector("#station-count");
  let activeRouteName = "地下鉄桜通線";
  let selectedStationKey = "";
  let cachedRoutes = [];
  let cachedStations = [];
  let activeMapView = "geographic";
  let leafletMap = null;
  let geographicMapReady = false;
  let geographicMarkers = [];
  let geographicLines = [];

  const nagoyaStationReference = {
    stationName: "名古屋",
    latitude: 35.171033,
    longitude: 136.88175
  };

  const targetOrder = [
    "地下鉄桜通線",
    "名鉄名古屋本線",
    "JR東海道本線",
    "名鉄豊田線",
    "JR中央本線",
    "名鉄犬山線",
    "名鉄津島線"
  ];

  const stationOrder = {
    "地下鉄桜通線": ["野並", "鳴子北", "相生山", "神沢", "徳重"],
    "名鉄名古屋本線": ["鳴海", "左京山", "有松", "中京競馬場前", "前後", "豊明"],
    "JR東海道本線": ["大高", "南大高"],
    "名鉄豊田線": ["赤池", "日進", "米野木"],
    "JR中央本線": ["勝川", "春日井", "神領", "高蔵寺"],
    "名鉄犬山線": ["上小田井", "西春", "徳重・名古屋芸大"],
    "名鉄津島線": ["須ヶ口", "甚目寺", "七宝", "木田"]
  };

  Promise.all([
    fetch("./data/routes.json").then((response) => response.json()),
    fetch("./data/stations.json").then((response) => response.json()),
    fetch("./data/route-map.json").then((response) => response.json())
  ])
    .then(([routes, stations, routeMapData]) => {
      const sortedRoutes = sortRoutes(routes);
      cachedRoutes = sortedRoutes;
      cachedStations = stations;
      routeCount.textContent = sortedRoutes.length;
      stationCount.textContent = stations.length;
      renderSummary(sortedRoutes);
      renderRouteMap(routeMapData);
      renderRoutes(sortedRoutes, stations);
      bindMapViewControls();
      geographicMapReady = renderGeographicMap(routeMapData);
      setMapView(geographicMapReady ? "geographic" : "diagram");
      if (!geographicMapReady && routeMapFallback) {
        routeMapFallback.hidden = false;
      }
    })
    .catch((error) => {
      console.error(error);
      routeSections.innerHTML = '<p class="empty">データを読み込めませんでした。ローカルサーバー経由で index.html を開いてください。</p>';
    });

  function sortRoutes(routes) {
    return routes.slice().sort((a, b) => {
      return targetOrder.indexOf(a.routeName) - targetOrder.indexOf(b.routeName);
    });
  }

  function renderSummary(routes) {
    routeSummary.innerHTML = routes.map((route) => `
      <tr>
        <td><strong>${escapeHtml(route.routeName)}</strong></td>
        <td>${value(route.targetSection)}</td>
        <td>${value(route.cityAccess)}</td>
        <td>${value(route.landPriceBand)}</td>
        <td>${value(route.landSupply)}</td>
        <td>${chips(route.terrainTrend)}</td>
        <td>${value(route.hazardTrend)}</td>
        <td>${value(route.familyFit)}</td>
      </tr>
    `).join("");
  }

  function renderRouteMap(mapData) {
    if (!routeMap || !mapData) {
      return;
    }

    const routeLookup = new Set(cachedRoutes.map((route) => route.routeName));
    const stationLookup = new Set(cachedStations.map((station) => stationKey(station.routeDisplayName, station.stationName)));
    const routes = (mapData.routes || []).filter((route) => routeLookup.has(route.routeName));
    const stations = (mapData.stations || []).filter((station) => stationLookup.has(stationKey(station.routeDisplayName, station.stationName)));

    routeMap.innerHTML = `
      <div class="route-map-scroll" role="group" aria-label="クリック式の模式路線マップ">
        <svg class="route-map-svg" viewBox="${escapeHtml(mapData.viewBox || "0 0 1120 660")}" role="img" aria-labelledby="route-map-svg-title route-map-svg-desc">
          <title id="route-map-svg-title">7路線27駅の模式路線マップ</title>
          <desc id="route-map-svg-desc">路線または駅を選ぶと該当する路線カードや駅カードへ移動します。実際の距離・方角・縮尺を表すものではありません。</desc>
          <g class="route-map-routes">
            ${routes.map(mapRoute).join("")}
          </g>
          <g class="route-map-stations">
            ${stations.map(mapStation).join("")}
          </g>
        </svg>
      </div>
    `;

    bindRouteMapActions();
    updateRouteMapSelection();
  }

  function renderGeographicMap(mapData) {
    if (!geographicMap || !window.L) {
      return false;
    }

    const stationsWithCoordinates = cachedStations.filter((station) => {
      return Number.isFinite(station.latitude) && Number.isFinite(station.longitude);
    });

    if (stationsWithCoordinates.length !== cachedStations.length) {
      return false;
    }

    geographicMap.innerHTML = "";
    geoMapLegend.innerHTML = "";
    geographicMarkers = [];
    geographicLines = [];

    leafletMap = window.L.map(geographicMap, {
      scrollWheelZoom: true,
      tap: true
    });

    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(leafletMap);

    const routeColors = new Map((mapData.routes || []).map((route) => [route.routeName, route.color || "#5f7f68"]));
    const allLatLngs = [[nagoyaStationReference.latitude, nagoyaStationReference.longitude]];

    const nagoyaMarker = window.L.circleMarker([nagoyaStationReference.latitude, nagoyaStationReference.longitude], {
      radius: 8,
      color: "#243342",
      fillColor: "#243342",
      fillOpacity: 0.9,
      weight: 2
    })
      .bindPopup("<strong>名古屋駅</strong><br>基準点")
      .addTo(leafletMap);

    const nagoyaElement = nagoyaMarker.getElement();
    if (nagoyaElement) {
      nagoyaElement.dataset.mapReference = "nagoya";
      nagoyaElement.setAttribute("tabindex", "0");
      nagoyaElement.setAttribute("role", "img");
      nagoyaElement.setAttribute("aria-label", "名古屋駅 基準点");
    }

    cachedRoutes.forEach((route) => {
      const routeStations = stationsWithCoordinates
        .filter((station) => station.routeDisplayName === route.routeName)
        .sort((a, b) => stationIndex(route.routeName, a.stationName) - stationIndex(route.routeName, b.stationName));
      const color = routeColors.get(route.routeName) || "#5f7f68";
      const latLngs = routeStations.map((station) => [station.latitude, station.longitude]);

      allLatLngs.push(...latLngs);

      if (latLngs.length > 1) {
        const line = window.L.polyline(latLngs, {
          color,
          weight: route.routeName === activeRouteName ? 6 : 4,
          opacity: route.routeName === activeRouteName ? 0.95 : 0.62
        })
          .bindPopup(`<strong>${escapeHtml(route.routeName)}</strong><br>駅間を結んだ概略線`)
          .addTo(leafletMap);

        line.on("click", () => selectRouteFromMap(route.routeName, ""));
        const lineElement = line.getElement();
        if (lineElement) {
          lineElement.dataset.mapRouteLine = route.routeName;
          lineElement.setAttribute("tabindex", "0");
          lineElement.setAttribute("role", "button");
          lineElement.setAttribute("aria-label", `${route.routeName}を表示`);
          lineElement.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectRouteFromMap(route.routeName, "");
            }
          });
        }
        geographicLines.push({ routeName: route.routeName, line, color });
      }

      routeStations.forEach((station) => {
        const marker = window.L.circleMarker([station.latitude, station.longitude], {
          radius: station.routeDisplayName === activeRouteName ? 8 : 7,
          color: "#243342",
          fillColor: color,
          fillOpacity: station.routeDisplayName === activeRouteName ? 0.95 : 0.78,
          weight: stationKey(station.routeDisplayName, station.stationName) === selectedStationKey ? 4 : 2
        })
          .bindPopup(`<strong>${escapeHtml(station.stationName)}</strong><br>${escapeHtml(station.routeDisplayName)}`)
          .addTo(leafletMap);

        marker.on("click", () => {
          selectRouteFromMap(station.routeDisplayName, station.stationName);
          marker.openPopup();
        });
        const markerElement = marker.getElement();
        if (markerElement) {
          markerElement.dataset.mapRoute = station.routeDisplayName;
          markerElement.dataset.mapStation = station.stationName;
          markerElement.dataset.mapKey = stationKey(station.routeDisplayName, station.stationName);
          markerElement.setAttribute("tabindex", "0");
          markerElement.setAttribute("role", "button");
          markerElement.setAttribute("aria-label", `${station.routeDisplayName} ${station.stationName}を表示`);
          markerElement.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectRouteFromMap(station.routeDisplayName, station.stationName);
              marker.openPopup();
            }
          });
        }
        geographicMarkers.push({
          routeName: station.routeDisplayName,
          stationName: station.stationName,
          stationKey: stationKey(station.routeDisplayName, station.stationName),
          marker,
          color
        });
      });
    });

    renderGeographicLegend(routeColors);
    leafletMap.fitBounds(allLatLngs, { padding: [28, 28] });
    decorateGeographicMapElements();
    updateGeographicMapSelection();
    return true;
  }

  function decorateGeographicMapElements() {
    const nagoyaElement = geographicMap?.querySelector(".leaflet-interactive");
    if (nagoyaElement) {
      nagoyaElement.dataset.mapReference = "nagoya";
      nagoyaElement.setAttribute("tabindex", "0");
      nagoyaElement.setAttribute("role", "img");
      nagoyaElement.setAttribute("aria-label", "名古屋駅 基準点");
    }

    geographicLines.forEach(({ routeName, line }) => {
      const element = line.getElement();
      if (!element || element.dataset.decorated === "true") {
        return;
      }

      element.dataset.decorated = "true";
      element.dataset.mapRouteLine = routeName;
      element.setAttribute("tabindex", "0");
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", `${routeName}を表示`);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRouteFromMap(routeName, "");
        }
      });
    });

    geographicMarkers.forEach(({ routeName, stationName, stationKey: key, marker }) => {
      const element = marker.getElement();
      if (!element || element.dataset.decorated === "true") {
        return;
      }

      element.dataset.decorated = "true";
      element.dataset.mapRoute = routeName;
      element.dataset.mapStation = stationName;
      element.dataset.mapKey = key;
      element.setAttribute("tabindex", "0");
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", `${routeName} ${stationName}を表示`);
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRouteFromMap(routeName, stationName);
          marker.openPopup();
        }
      });
    });
  }

  function renderGeographicLegend(routeColors) {
    if (!geoMapLegend) {
      return;
    }

    geoMapLegend.innerHTML = cachedRoutes.map((route) => {
      const color = escapeHtml(routeColors.get(route.routeName) || "#5f7f68");
      const selected = route.routeName === activeRouteName;
      return `
        <button class="geo-map-legend-button" type="button" data-map-route="${escapeHtml(route.routeName)}" aria-pressed="${selected ? "true" : "false"}">
          <span class="geo-map-legend-swatch" style="background:${color}"></span>
          <span>${escapeHtml(route.routeName)}</span>
        </button>
      `;
    }).join("");

    geoMapLegend.querySelectorAll("[data-map-route]").forEach((button) => {
      button.addEventListener("click", () => {
        selectRouteFromMap(button.dataset.mapRoute, "");
      });
    });
  }

  function bindMapViewControls() {
    geographicViewButton?.addEventListener("click", () => {
      if (geographicMapReady) {
        setMapView("geographic");
      }
    });

    diagramViewButton?.addEventListener("click", () => {
      setMapView("diagram");
    });
  }

  function setMapView(viewName) {
    activeMapView = viewName;
    const showGeographic = viewName === "geographic" && geographicMapReady;

    if (geographicMap) {
      geographicMap.hidden = !showGeographic;
    }
    if (geoMapLegend) {
      geoMapLegend.hidden = !showGeographic;
    }
    if (routeMap) {
      routeMap.hidden = showGeographic;
    }
    geographicViewButton?.setAttribute("aria-pressed", showGeographic ? "true" : "false");
    diagramViewButton?.setAttribute("aria-pressed", showGeographic ? "false" : "true");

    if (showGeographic && leafletMap) {
      window.setTimeout(() => leafletMap.invalidateSize(), 0);
    }
  }

  function updateGeographicMapSelection() {
    if (!leafletMap) {
      return;
    }

    geographicLines.forEach(({ routeName, line, color }) => {
      const isActiveRoute = routeName === activeRouteName;
      line.setStyle({
        color,
        weight: isActiveRoute ? 6 : 4,
        opacity: isActiveRoute ? 0.95 : 0.62
      });
    });

    geographicMarkers.forEach(({ routeName, stationKey: key, marker, color }) => {
      const isActiveRoute = routeName === activeRouteName;
      const isActiveStation = Boolean(selectedStationKey) && key === selectedStationKey;
      marker.setStyle({
        radius: isActiveStation ? 9 : isActiveRoute ? 8 : 7,
        color: isActiveStation ? "#111827" : "#243342",
        fillColor: color,
        fillOpacity: isActiveRoute || isActiveStation ? 0.95 : 0.72,
        weight: isActiveStation ? 4 : 2
      });
    });

    geoMapLegend?.querySelectorAll("[data-map-route]").forEach((button) => {
      const isActiveRoute = button.dataset.mapRoute === activeRouteName;
      button.classList.toggle("is-active-route", isActiveRoute);
      button.setAttribute("aria-pressed", isActiveRoute ? "true" : "false");
    });
  }

  function mapRoute(route) {
    const points = Array.isArray(route.points) ? route.points : [];
    const pathData = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point[0]} ${point[1]}`).join(" ");
    const label = route.label || {};
    const color = escapeHtml(route.color || "#5f7f68");
    const routeName = escapeHtml(route.routeName);

    return `
      <g class="route-map-route" data-map-route="${routeName}" tabindex="0" role="button" aria-label="${routeName}を表示">
        <path class="route-map-line route-map-line-hit" d="${pathData}" />
        <path class="route-map-line" d="${pathData}" stroke="${color}" />
        <text class="route-map-route-label" x="${numberValue(label.x, 0)}" y="${numberValue(label.y, 0)}" fill="${color}">${routeName}</text>
      </g>
    `;
  }

  function mapStation(station) {
    const key = stationKey(station.routeDisplayName, station.stationName);
    const routeName = escapeHtml(station.routeDisplayName);
    const stationName = escapeHtml(station.stationName);
    const x = numberValue(station.x, 0);
    const y = numberValue(station.y, 0);
    const labelX = x + numberValue(station.labelDx, 0);
    const labelY = y + numberValue(station.labelDy, -16);
    const anchor = escapeHtml(station.anchor || "middle");

    return `
      <g class="route-map-station" data-map-route="${routeName}" data-map-station="${stationName}" data-map-key="${escapeHtml(key)}" tabindex="0" role="button" aria-label="${routeName} ${stationName}を表示">
        <circle class="route-map-station-dot" cx="${x}" cy="${y}" r="8" />
        <circle class="route-map-station-hit" cx="${x}" cy="${y}" r="18" />
        <text class="route-map-station-label" x="${labelX}" y="${labelY}" text-anchor="${anchor}">${stationName}</text>
      </g>
    `;
  }

  function bindRouteMapActions() {
    if (!routeMap) {
      return;
    }

    routeMap.querySelectorAll("[data-map-route]").forEach((item) => {
      item.addEventListener("click", () => {
        selectRouteFromMap(item.dataset.mapRoute, item.dataset.mapStation || "");
      });
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectRouteFromMap(item.dataset.mapRoute, item.dataset.mapStation || "");
        }
      });
    });
  }

  function selectRouteFromMap(routeName, stationName) {
    if (!routeName) {
      return;
    }

    activeRouteName = routeName;
    selectedStationKey = stationName ? stationKey(routeName, stationName) : "";
    renderRoutes(cachedRoutes, cachedStations);
    updateRouteMapSelection();
    updateGeographicMapSelection();

    const target = stationName
      ? document.getElementById(stationCardId(routeName, stationName))
      : routeSections.querySelector(".route-panel");

    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (stationName) {
        target.classList.remove("station-card-highlight");
        window.setTimeout(() => target.classList.add("station-card-highlight"), 20);
        window.setTimeout(() => target.classList.remove("station-card-highlight"), 2200);
      }
    }
  }

  function updateRouteMapSelection() {
    if (!routeMap) {
      return;
    }

    routeMap.querySelectorAll("[data-map-route]").forEach((item) => {
      const isActiveRoute = item.dataset.mapRoute === activeRouteName;
      item.classList.toggle("is-active-route", isActiveRoute);
      item.setAttribute("aria-pressed", isActiveRoute ? "true" : "false");
    });

    routeMap.querySelectorAll("[data-map-key]").forEach((item) => {
      item.classList.toggle("is-active-station", Boolean(selectedStationKey) && item.dataset.mapKey === selectedStationKey);
    });
  }

  function renderRoutes(routes, stations) {
    if (!routes.length) {
      routeSections.innerHTML = '<p class="empty">表示できる路線データがありません。</p>';
      return;
    }

    if (!routes.some((route) => route.routeName === activeRouteName)) {
      activeRouteName = routes[0].routeName;
    }

    const activeRoute = routes.find((route) => route.routeName === activeRouteName) || routes[0];

    routeSections.innerHTML = `
      <div class="route-tabs" role="tablist" aria-label="路線を選択">
        ${routes.map((route) => routeTab(route)).join("")}
      </div>
      <div class="route-panel" role="tabpanel" aria-labelledby="${routeTabId(activeRoute.routeName)}">
        ${routeCard(activeRoute, stations)}
      </div>
    `;

    bindRouteImageFallbacks(routeSections);

    routeSections.querySelectorAll(".route-tab").forEach((button) => {
      button.addEventListener("click", () => {
        activeRouteName = button.dataset.routeName;
        selectedStationKey = "";
        renderRoutes(routes, stations);
        updateRouteMapSelection();
        updateGeographicMapSelection();
      });
    });
  }

  function routeTab(route) {
    const selected = route.routeName === activeRouteName;

    return `
      <button
        class="route-tab"
        id="${routeTabId(route.routeName)}"
        type="button"
        role="tab"
        aria-selected="${selected ? "true" : "false"}"
        data-route-name="${escapeHtml(route.routeName)}"
      >
        ${escapeHtml(route.routeName)}
      </button>
    `;
  }

  function routeTabId(routeName) {
    const index = Math.max(0, targetOrder.indexOf(routeName));
    return `route-tab-${index}`;
  }

  function routeCard(route, stations) {
    const routeStations = stations
      .filter((station) => station.routeDisplayName === route.routeName)
      .sort((a, b) => stationIndex(route.routeName, a.stationName) - stationIndex(route.routeName, b.stationName));

    return `
      <article class="route-card">
        ${routeImage(route)}
        <div class="route-card-header">
          <div class="route-title-row">
            <h3>${escapeHtml(route.routeName)}</h3>
            <span class="badge">${value(route.targetSection)}</span>
          </div>
          <div class="route-meta">
            <span>${value(route.operator)}</span>
            <span>${value(route.routeType)}</span>
            <span>都心アクセス: ${value(route.cityAccess)}</span>
            <span>名古屋駅方面アクセス: ${value(route.nagoyaStationAccess)}</span>
            <span>土地供給感: ${value(route.landSupply)}</span>
          </div>
        </div>
        <div class="route-body">
          <div class="route-copy-grid">
            ${copyBlock("沿線サマリー", route.summary)}
            ${copyBlock("不動産的見立て", route.realEstateView)}
            ${copyBlock("向いている家族像", route.familyFit)}
            ${copyBlock("注意点", route.cautions)}
          </div>
          <div class="station-grid">
            ${routeStations.length ? routeStations.map(renderStation).join("") : '<p class="empty">対象駅データがありません。</p>'}
          </div>
          <p class="source-note">${sourceLabel(route.sourceUrl, "route")}</p>
        </div>
      </article>
    `;
  }

  function renderStation(station) {
    const cardId = stationCardId(station.routeDisplayName, station.stationName);

    return `
      <article class="station-card" id="${cardId}" data-route-name="${escapeHtml(station.routeDisplayName)}" data-station-name="${escapeHtml(station.stationName)}">
        <div class="station-head">
          <h4>${escapeHtml(station.stationName)}</h4>
          <span class="badge">${value(station.routeName)}</span>
        </div>
        <dl class="station-key-details">
          ${detail("概算坪単価レンジ", priceRange(station.estimatedLandPriceManPerTsubo))}
          ${detail("ハザード注意度", station.hazardLevel)}
          ${detail("土地探し難易度", station.landSearchDifficulty)}
        </dl>
        <p class="station-comment">${value(station.realEstateComment)}</p>
        <details class="station-more">
          <summary>詳細を見る</summary>
          <dl class="station-details">
            ${detail("駅タイプ", station.stationType)}
            ${detail("概算乗降者数", station.passengerCountPerDay ? `${number(station.passengerCountPerDay)}人/日` : "")}
            ${detail("地形タイプ", listValue(station.terrainType))}
            ${detail("車生活相性", station.carLifestyleFit)}
            ${detail("徒歩生活相性", station.walkLifestyleFit)}
            ${detail("要注意ポイント", listValue(station.cautionTags))}
          </dl>
          <p class="source-note">${sourceLabel(station.sourceUrl, "station")}</p>
        </details>
      </article>
    `;
  }

  function copyBlock(title, text) {
    return `
      <section class="copy-block">
        <h4>${escapeHtml(title)}</h4>
        <p>${value(text)}</p>
      </section>
    `;
  }

  function routeImage(route) {
    const theme = value(route.imageTheme || "沿線イメージ");
    const alt = value(route.imageAlt || `${route.routeName}の沿線イメージ`);
    const imagePath = route.imagePath ? escapeHtml(route.imagePath) : "";

    if (imagePath && route.imageStatus !== "placeholder") {
      return `
        <figure class="route-image-frame">
          <img class="route-image" src="${imagePath}" alt="${alt}" loading="lazy">
          <figcaption class="route-image-caption">沿線イメージ</figcaption>
          ${routeImagePlaceholder(theme, alt, route.imageStatus, true)}
        </figure>
      `;
    }

    return routeImagePlaceholder(theme, alt, route.imageStatus, false);
  }

  function routeImagePlaceholder(theme, alt, status, hidden) {
    return `
      <div class="route-image-placeholder${hidden ? " route-image-fallback" : ""}" role="img" aria-label="${alt}" data-status="${escapeHtml(status || "placeholder")}"${hidden ? " hidden" : ""}>
        <span class="image-kicker">沿線イメージ</span>
        <strong>${theme}</strong>
        <small>画像準備中</small>
      </div>
    `;
  }

  function bindRouteImageFallbacks(scope) {
    scope.querySelectorAll(".route-image-frame").forEach((frame) => {
      const image = frame.querySelector(".route-image");
      const caption = frame.querySelector(".route-image-caption");
      const fallback = frame.querySelector(".route-image-fallback");

      if (!image || !fallback) {
        return;
      }

      image.addEventListener("error", () => {
        image.hidden = true;
        if (caption) {
          caption.hidden = true;
        }
        fallback.hidden = false;
      }, { once: true });
    });
  }

  function detail(label, text) {
    return `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${value(text)}</dd>
      </div>
    `;
  }

  function stationIndex(routeName, stationName) {
    const order = stationOrder[routeName] || [];
    const index = order.indexOf(stationName);
    return index === -1 ? 999 : index;
  }

  function stationKey(routeName, stationName) {
    return `${routeName}::${stationName}`;
  }

  function stationCardId(routeName, stationName) {
    return `station-${encodeURIComponent(routeName)}-${encodeURIComponent(stationName)}`.replaceAll("%", "");
  }

  function numberValue(input, fallback) {
    const value = Number(input);
    return Number.isFinite(value) ? value : fallback;
  }

  function sourceLabel(url, cardType) {
    if (!url || url.includes("re-port.net")) {
      return "参考情報：公開情報・社内調査メモをもとに作成 / 詳細出典確認中";
    }

    const officialDomains = [
      "jr-central.co.jp",
      "meitetsu.co.jp",
      "kotsu.city.nagoya.jp"
    ];

    if (cardType === "station" && officialDomains.some((domain) => url.includes(domain))) {
      return "参考情報：鉄道会社公式情報・社内調査メモをもとに作成 / 地価・ハザードは詳細確認中";
    }

    return "参考情報：公式情報・公開情報をもとに作成";
  }

  function chips(items) {
    const values = Array.isArray(items) ? items : [];
    return values.length ? values.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join(" ") : "要確認";
  }

  function listValue(items) {
    return Array.isArray(items) && items.length ? items.join(" / ") : "";
  }

  function number(input) {
    return new Intl.NumberFormat("ja-JP").format(input);
  }

  function priceRange(input) {
    if (input === null || input === undefined || input === "") {
      return "";
    }

    const price = Number(input);
    if (!Number.isFinite(price)) {
      return "";
    }

    const min = Math.max(0, price - 5);
    const max = price + 5;
    return `${number(min)}〜${number(max)}万円/坪目安`;
  }

  function value(input) {
    if (input === null || input === undefined || input === "") {
      return "要確認";
    }

    return escapeHtml(String(input));
  }

  function escapeHtml(input) {
    return input
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();

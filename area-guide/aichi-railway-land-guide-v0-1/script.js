(function () {
  const routeSummary = document.querySelector("#route-summary");
  const routeSections = document.querySelector("#route-sections");
  const routeCount = document.querySelector("#route-count");
  const stationCount = document.querySelector("#station-count");

  const targetOrder = [
    "地下鉄桜通線",
    "名鉄名古屋本線",
    "JR東海道本線",
    "名鉄豊田線",
    "JR中央本線",
    "名鉄犬山線"
  ];

  const stationOrder = {
    "地下鉄桜通線": ["野並", "鳴子北", "相生山", "神沢", "徳重"],
    "名鉄名古屋本線": ["鳴海", "左京山", "有松", "中京競馬場前", "前後", "豊明"],
    "JR東海道本線": ["大高", "南大高"],
    "名鉄豊田線": ["赤池", "日進", "米野木"],
    "JR中央本線": ["勝川", "春日井", "神領", "高蔵寺"],
    "名鉄犬山線": ["上小田井", "西春", "徳重・名古屋芸大"]
  };

  Promise.all([
    fetch("./data/routes.json").then((response) => response.json()),
    fetch("./data/stations.json").then((response) => response.json())
  ])
    .then(([routes, stations]) => {
      const sortedRoutes = sortRoutes(routes);
      routeCount.textContent = sortedRoutes.length;
      stationCount.textContent = stations.length;
      renderSummary(sortedRoutes);
      renderRoutes(sortedRoutes, stations);
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

  function renderRoutes(routes, stations) {
    if (!routes.length) {
      routeSections.innerHTML = '<p class="empty">表示できる路線データがありません。</p>';
      return;
    }

    routeSections.innerHTML = routes.map((route) => {
      const routeStations = stations
        .filter((station) => station.routeDisplayName === route.routeName)
        .sort((a, b) => stationIndex(route.routeName, a.stationName) - stationIndex(route.routeName, b.stationName));

      return `
        <article class="route-card">
          <div class="route-card-header">
            <div class="route-title-row">
              <h3>${escapeHtml(route.routeName)}</h3>
              <span class="badge">${value(route.targetSection)}</span>
            </div>
            <div class="route-meta">
              <span>${value(route.operator)}</span>
              <span>${value(route.routeType)}</span>
              <span>都心アクセス: ${value(route.cityAccess)}</span>
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
    }).join("");
  }

  function renderStation(station) {
    return `
      <article class="station-card">
        <div class="station-head">
          <h4>${escapeHtml(station.stationName)}</h4>
          <span class="badge">${value(station.routeName)}</span>
        </div>
        <dl class="station-details">
          ${detail("駅タイプ", station.stationType)}
          ${detail("概算乗降者数", station.passengerCountPerDay ? `${number(station.passengerCountPerDay)}人/日` : "")}
          ${detail("概算地価", station.estimatedLandPriceManPerTsubo ? `${number(station.estimatedLandPriceManPerTsubo)}万円/坪` : "")}
          ${detail("地形タイプ", listValue(station.terrainType))}
          ${detail("ハザード注意度", station.hazardLevel)}
          ${detail("土地探し難易度", station.landSearchDifficulty)}
          ${detail("車生活相性", station.carLifestyleFit)}
          ${detail("徒歩生活相性", station.walkLifestyleFit)}
          ${detail("要注意ポイント", listValue(station.cautionTags))}
        </dl>
        <p>${value(station.realEstateComment)}</p>
        <p class="source-note">${sourceLabel(station.sourceUrl, "station")}</p>
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

  function sourceLabel(url, cardType) {
    if (!url || url.includes("re-port.net")) {
      return "主要出典：Notion DB / 詳細ソース確認中";
    }

    const officialDomains = [
      "jr-central.co.jp",
      "meitetsu.co.jp",
      "kotsu.city.nagoya.jp"
    ];

    if (cardType === "station" && officialDomains.some((domain) => url.includes(domain))) {
      return "主要出典：鉄道会社公式 / 地価・ハザード詳細確認中";
    }

    return `主要出典：${escapeHtml(url)}`;
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

(function () {
  const routeSummary = document.querySelector("#route-summary");
  const routeSections = document.querySelector("#route-sections");
  const routeCount = document.querySelector("#route-count");
  const stationCount = document.querySelector("#station-count");
  let activeRouteName = "地下鉄桜通線";

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
        renderRoutes(routes, stations);
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
    return `
      <article class="station-card">
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

const tools = [
  {
    title: "不動産情報ライブラリ",
    url: "https://www.reinfolib.mlit.go.jp/",
    category: "first price",
    categoryLabel: "まず見る3サイト / 価格・相場",
    priority: "A",
    type: "公的情報",
    description: "不動産の取引価格、地価、周辺施設などを調べるための国土交通省の情報サイト。土地や家を検討するときの入口として使いやすいサイトです。",
    note: "まほろば視点：価格だけでなく、周辺施設や地域情報と合わせて、候補地の全体像をつかむ入口にします。",
    caution: "掲載情報は判断材料のひとつです。個別の土地価格は、接道、形状、高低差、造成、建築条件などで変わります。"
  },
  {
    title: "重ねるハザードマップ",
    url: "https://disaportal.gsi.go.jp/maps/index.html?ll=35.211159,136.883984&z=14&base=pale&ls=experimental_landformclassification&disp=1&vs=c1j0l0u0t0h0z0",
    category: "first hazard",
    categoryLabel: "まず見る3サイト / 災害・地形",
    priority: "A",
    type: "公的情報",
    description: "洪水、土砂災害、地形分類などを地図上で重ねて確認できるサイト。土地探しでは必ず見ておきたい基本ツールです。",
    note: "まほろば視点：浸水想定の色だけでなく、標高、地形分類、川との距離、避難経路まで合わせて読みます。",
    caution: "ハザードマップは危険の可能性を示すものです。土地の良し悪しを単純に決めるものではなく、建物計画や避難計画とセットで考えます。"
  },
  {
    title: "マップあいち",
    url: "https://maps.pref.aichi.jp/",
    category: "first aichi",
    categoryLabel: "まず見る3サイト / 愛知・名古屋",
    priority: "A",
    type: "愛知ローカル",
    description: "愛知県の統合型地理情報システム。愛知県内の行政・防災・地域情報を地図で確認する入口になります。",
    note: "まほろば視点：愛知・名古屋周辺の土地を見るときは、全国サイトだけでなく県のGISも重ねて確認します。",
    caution: "市町村ごとの詳細情報は、各自治体の公式ページで追加確認してください。"
  },
  {
    title: "土地代データ",
    url: "https://tochidai.info/",
    category: "price",
    categoryLabel: "価格・相場",
    priority: "A",
    type: "相場確認",
    description: "市区町村や駅周辺の土地価格の目安、地価推移、ランキングなどを見られるサイト。最初の相場観づくりに便利です。",
    note: "まほろば視点：実勢価格とはズレることもありますが、エリア比較と相場観づくりの入口として使いやすいサイトです。",
    caution: "表示価格はそのまま売買価格ではありません。接道、形状、高低差、造成、駅距離などで実際の価格は大きく変わります。"
  },
  {
    title: "シームレスバスマップ",
    url: "https://www.rosenzu.com/~sbm/maps.html#15/35.0618/137.0078",
    category: "life aichi",
    categoryLabel: "交通・生活圏 / 愛知・名古屋",
    priority: "B",
    type: "交通",
    description: "バス路線を地図上で確認するためのサイト。駅距離だけでは見えない生活動線を確認するときに役立ちます。",
    note: "まほろば視点：車社会の地域でも、高校通学、老後の移動、駅接続を考えるとバス路線は重要です。",
    caution: "運行状況やダイヤは変更されるため、最終的には各交通事業者の公式情報を確認してください。"
  },
  {
    title: "iezo.net",
    url: "https://www.iezo.net/",
    category: "life",
    categoryLabel: "学区・子育て環境",
    priority: "B",
    type: "学区",
    description: "小中学校の学区や学校周辺情報を調べる入口として使えるサイト。子育て世帯の土地探しで参考になります。",
    note: "まほろば視点：学区は資産性や暮らしの満足度にも関わります。ただし、人気だけでなく家族との相性を見ることが大切です。",
    caution: "学区は変更されることがあります。必ず自治体・教育委員会の公式情報で最終確認してください。"
  },
  {
    title: "愛知県 子ども医療費助成制度の参考情報",
    url: "https://aichi-hkn.jp/yoriyoi/22623",
    category: "life aichi",
    categoryLabel: "子育て・暮らし制度 / 愛知・名古屋",
    priority: "B",
    type: "制度",
    description: "愛知県内の子ども医療費助成制度の違いを把握する参考情報。子育て世帯の自治体比較に使えます。",
    note: "まほろば視点：同じ愛知県内でも、自治体によって子育て支援の体感は変わります。制度も暮らしやすさの一部です。",
    caution: "制度は変わるため、必ず自治体公式サイトで最新情報を確認してください。"
  },
  {
    title: "どこまで行けるマップ",
    url: "https://nearby-map.com/?station=%E5%90%8D%E5%8F%A4%E5%B1%8B&time=45&transfer=1",
    category: "life",
    categoryLabel: "交通・生活圏",
    priority: "B",
    type: "移動圏",
    description: "駅から指定時間でどこまで行けるかを確認できるマップ。通勤・通学・生活圏のイメージをつかむのに便利です。",
    note: "まほろば視点：『名駅まで何分』だけでなく、乗換回数や心理的な距離感も含めて生活圏を見ます。",
    caution: "実際の所要時間は時間帯、乗換、徒歩距離、運行状況で変わります。"
  },
  {
    title: "希望エリア可視化マップ",
    url: "https://nowwest21works-tech.github.io/mahoroba-reports/map-circles/",
    category: "original",
    categoryLabel: "まほろばオリジナル",
    priority: "A",
    type: "自社ツール",
    description: "地図上に円を描いて、希望駅や地点からの距離感を見える化するまほろばオリジナルツールです。",
    note: "まほろば視点：『この辺がいい』という感覚を、面談前に地図上で共有できるようにします。",
    caution: "距離や円は目安です。実際の移動時間や生活感は現地確認と合わせて判断します。"
  },
  {
    title: "古地図散歩 時代を重ねるマップ",
    url: "https://apps.apple.com/jp/app/%E5%8F%A4%E5%9C%B0%E5%9B%B3%E6%95%A3%E6%AD%A9-%E6%99%82%E4%BB%A3%E3%82%92%E9%87%8D%E3%81%AD%E3%82%8B%E3%83%9E%E3%83%83%E3%83%97/id1454918505",
    category: "history",
    categoryLabel: "土地の履歴・昔の姿",
    priority: "B",
    type: "アプリ",
    description: "昔の地図と今の地図を重ねて、土地の変化を確認できるアプリ。過去の地形や土地利用を見る入口になります。",
    note: "まほろば視点：旧河道、低湿地、昔の集落、田畑の履歴など、今の地図だけでは見えない文脈を探ります。",
    caution: "古地図は精度や年代に限界があります。仮説づくりとして使い、現地確認や公的資料と合わせて判断します。"
  },
  {
    title: "昔の航空写真地図（70年代マップ）",
    url: "https://apps.apple.com/jp/app/%E6%98%94%E3%81%AE%E8%88%AA%E7%A9%BA%E5%86%99%E7%9C%9F%E5%9C%B0%E5%9B%B3-70%E5%B9%B4%E4%BB%A3%E3%83%9E%E3%83%83%E3%83%97/id1177752029",
    category: "history",
    categoryLabel: "土地の履歴・昔の姿",
    priority: "B",
    type: "アプリ",
    description: "昔の航空写真から、過去の土地利用や周辺環境を確認するためのアプリです。",
    note: "まほろば視点：造成前の姿、田畑、工場、水路、旧道などを見て、土地の履歴を読む材料にします。",
    caution: "現在の安全性や利用条件を直接示すものではありません。参考情報として扱います。"
  },
  {
    title: "スーパー地形",
    url: "https://apps.apple.com/jp/app/%E3%82%B9%E3%83%BC%E3%83%91%E3%83%BC%E5%9C%B0%E5%BD%A2/id1092797286",
    category: "hazard history",
    categoryLabel: "災害・地形 / 土地の履歴",
    priority: "A",
    type: "アプリ",
    description: "高低差や地形を立体的に確認できる地図アプリ。現地確認や地形理解にかなり役立ちます。",
    note: "まほろば視点：平面地図では見落としやすい微地形、高低差、谷筋、台地、低地の感覚をつかむために使います。",
    caution: "専門的な判断が必要な場合は、自治体資料、ハザードマップ、現地調査と合わせて確認してください。"
  }
];

const hazardItems = [
  "洪水浸水想定区域を確認した",
  "内水氾濫リスクを確認した",
  "土砂災害警戒区域を確認した",
  "標高・地形分類を確認した",
  "過去の土地利用や古地図を確認した",
  "避難所までの距離と経路を確認した",
  "家族構成に合う避難計画を考えた"
];

const consultItems = [
  "希望エリア",
  "予算",
  "駅距離",
  "学区",
  "通勤",
  "ハザード許容度",
  "建築会社の有無",
  "必要な土地の広さ",
  "譲れない条件",
  "避けたい条件"
];

function createToolCard(tool) {
  const article = document.createElement("article");
  article.className = "tool-card";
  article.dataset.category = tool.category;

  article.innerHTML = `
    <div class="card-meta">
      <span class="tag">${tool.categoryLabel}</span>
      <span class="tag priority">優先度 ${tool.priority}</span>
      <span class="tag">${tool.type}</span>
    </div>
    <h3>${tool.title}</h3>
    <p>${tool.description}</p>
    <p class="note">${tool.note}</p>
    <p class="caution">注意：${tool.caution}</p>
    <a href="${tool.url}" target="_blank" rel="noopener">開く</a>
  `;

  return article;
}

function renderTools(filter = "all") {
  const list = document.getElementById("toolList");
  list.innerHTML = "";

  const filtered = filter === "all"
    ? tools
    : tools.filter((tool) => tool.category.split(" ").includes(filter));

  filtered.forEach((tool) => list.appendChild(createToolCard(tool)));
}

function renderFirstThree() {
  const list = document.getElementById("firstThreeList");
  const firstThree = tools.filter((tool) => tool.category.split(" ").includes("first"));
  firstThree.forEach((tool) => list.appendChild(createToolCard(tool)));
}

function setupFilters() {
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter-button").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      renderTools(button.dataset.filter);
    });
  });
}

function setupCalculator() {
  const input = document.getElementById("landPrice");
  const rate = document.getElementById("costRate");
  const button = document.getElementById("calculateCost");
  const result = document.getElementById("costResult");

  button.addEventListener("click", () => {
    const price = Number(input.value);
    const costRate = Number(rate.value);

    if (!price || price <= 0) {
      result.textContent = "土地価格を万円単位で入力してください。";
      return;
    }

    const brokerage = price * 0.03 + 6;
    const tax = brokerage * 0.1;
    const brokerageTotal = brokerage + tax;
    const otherCosts = price * costRate;
    const totalCosts = brokerageTotal + otherCosts;
    const grandTotal = price + totalCosts;

    result.innerHTML = `
      <strong>概算結果</strong><br>
      土地価格：${price.toLocaleString()}万円<br>
      仲介手数料目安：約${Math.round(brokerageTotal).toLocaleString()}万円（税込）<br>
      その他諸費用目安：約${Math.round(otherCosts).toLocaleString()}万円<br>
      <strong>諸費用合計目安：約${Math.round(totalCosts).toLocaleString()}万円</strong><br>
      <strong>総額目安：約${Math.round(grandTotal).toLocaleString()}万円</strong><br>
      <small>※仲介手数料は「売買価格×3%＋6万円＋消費税」の簡易計算です。実際の費用は条件により変わります。</small>
    `;
  });
}

function renderChecklist() {
  const hazard = document.getElementById("hazardChecklist");
  const score = document.getElementById("hazardScore");

  hazardItems.forEach((item, index) => {
    const label = document.createElement("label");
    label.className = "check-item";
    label.innerHTML = `<input type="checkbox" data-hazard-check> <span>${item}</span>`;
    hazard.appendChild(label);
  });

  hazard.addEventListener("change", () => {
    const checked = hazard.querySelectorAll("input:checked").length;
    score.textContent = `${checked} / ${hazardItems.length} 項目確認済み`;
  });

  const consult = document.getElementById("consultChecklist");
  consultItems.forEach((item) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox"> ${item}`;
    consult.appendChild(label);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderFirstThree();
  renderTools();
  setupFilters();
  setupCalculator();
  renderChecklist();
});

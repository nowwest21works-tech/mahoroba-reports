(function () {
  "use strict";

  const state = { concern: null, stage: null, area: null, feedback: null, recommended: [] };

  const concerns = [
    { id: "budget", icon: "💴", label: "予算・総額", sub: "土地以外に、結局いくら必要？" },
    { id: "hazard", icon: "🌊", label: "水害・地形", sub: "まず水害と土地の成り立ちを確認" },
    { id: "commute", icon: "🚉", label: "通勤・通学・移動", sub: "駅から届く範囲やバス路線を見たい" },
    { id: "price", icon: "📈", label: "価格・相場", sub: "周辺の地価や取引情報を比べたい" },
    { id: "build", icon: "🏗️", label: "建てられるか", sub: "用途地域・道路・法規制が不安" },
    { id: "school", icon: "🏫", label: "学区・子育て", sub: "通学区域や暮らしの条件を確認したい" },
    { id: "local", icon: "🏘️", label: "現地環境・暮らし", sub: "周辺施設や地域の特徴を見たい" },
    { id: "unknown", icon: "🌱", label: "まだ、よく分からない", sub: "何から見ればいいか整理したい" }
  ];

  const stages = [
    { id: "before", icon: "🌱", label: "まだ探し始めたばかり", sub: "条件やエリアもこれから" },
    { id: "compare", icon: "🧭", label: "エリアを比較している", sub: "どこに住むかを考え中" },
    { id: "found", icon: "📍", label: "気になる土地がある", sub: "候補地をもう見つけている" },
    { id: "visit", icon: "🚶", label: "現地へ行く前・行った後", sub: "現場で何を見るか整理したい" },
    { id: "apply", icon: "✍️", label: "申込を考えている", sub: "判断漏れがないか確認したい" },
    { id: "finance", icon: "🧮", label: "資金計画を考えている", sub: "予算やローンを整理したい" }
  ];

  const areas = [
    { id: "nagoya", icon: "🏙️", label: "名古屋市", sub: "名古屋市内で検討" },
    { id: "aichi", icon: "🟦", label: "愛知県内", sub: "名古屋市外を含む" },
    { id: "other", icon: "🗾", label: "それ以外", sub: "岐阜・三重・その他" },
    { id: "none", icon: "☁️", label: "まだ決まっていない", sub: "エリアから相談したい" }
  ];

  const tools = [
    {
      id: "mahoroba-map", icon: "🗺️", name: "希望エリア可視化マップ",
      url: "https://nowwest21works-tech.github.io/mahoroba-reports/map-circles/",
      areas: ["nagoya", "aichi", "other", "none"], sourceType: "まほろば", access: "スマホWeb", difficulty: "かんたん",
      lookAt: "勤務先・学校・駅など、動かせない場所から候補エリアまでの距離。",
      learn: "複数の基準地点から、希望エリアの重なりを地図で整理できます。",
      boundary: "渋滞・坂道・騒音・街の雰囲気や、実際の所要時間は分かりません。",
      why: "候補地を絞る前に、自分たちの条件を地図へ置けるから。"
    },
    {
      id: "total", icon: "🧮", name: "土地購入 総額シミュレータ",
      url: "https://land-purchase-build-a.nowwest21works.chatgpt.site/",
      areas: ["nagoya", "aichi", "other", "none"], sourceType: "まほろば", access: "スマホWeb", difficulty: "かんたん",
      lookAt: "土地価格以外に加わる諸費用と、総額の内訳。",
      learn: "土地価格だけでなく、諸費用まで含めた購入総額の目安が分かります。",
      boundary: "個別の融資条件・税制・建築条件などで実額は変わります。",
      why: "「土地価格」と「本当に必要な総額」を分けて考えられるから。"
    },
    {
      id: "hazard", icon: "🌊", name: "重ねるハザードマップ",
      url: "https://disaportal.gsi.go.jp/",
      areas: ["nagoya", "aichi", "other", "none"], sourceType: "国の公的情報", access: "スマホWeb", difficulty: "かんたん",
      lookAt: "候補地周辺の洪水・土砂災害・高潮・津波の想定区域。",
      learn: "Pilotではまず、水害・土砂災害など公表済みの想定区域を確認できます。",
      boundary: "色がない場所も安全保証ではありません。地震・液状化・個別地盤は自治体資料や専門調査で別に確認します。",
      why: "水害・地形を気にするときの最初の公的確認先だから。"
    },
    {
      id: "gsi", icon: "⛰️", name: "地理院地図",
      url: "https://maps.gsi.go.jp/",
      areas: ["nagoya", "aichi", "other", "none"], sourceType: "国の公的情報", access: "スマホWeb", difficulty: "少し慣れが必要",
      lookAt: "標高、土地の起伏、地形分類、過去の航空写真。",
      learn: "ハザード色の背景にある、土地の成り立ちや高低差を見られます。",
      boundary: "個別敷地の地盤強度・液状化判定・排水性能を直接示すものではありません。",
      why: "ハザードの色だけでなく、地形そのものを見るため。"
    },
    {
      id: "reinfolib", icon: "📊", name: "不動産情報ライブラリ",
      url: "https://www.reinfolib.mlit.go.jp/",
      areas: ["nagoya", "aichi", "other", "none"], sourceType: "国の公的情報", access: "スマホWeb", difficulty: "少し慣れが必要",
      lookAt: "候補地周辺の取引価格、地価公示、用途地域などのレイヤー。",
      learn: "売出価格とは別に、公的な取引・地価・都市計画情報を見られます。",
      boundary: "過去取引や公的地価は、目の前の土地の成約価格を保証しません。",
      why: "売出価格だけでなく、公的データから周辺を眺め直せるから。"
    },
    {
      id: "urban", icon: "🏗️", name: "不動産情報ライブラリ｜都市計画情報",
      url: "https://www.reinfolib.mlit.go.jp/",
      areas: ["nagoya", "aichi", "other", "none"], sourceType: "国の公的情報", access: "スマホWeb", difficulty: "少し慣れが必要",
      lookAt: "用途地域など、土地利用・都市計画に関するレイヤー。",
      learn: "建て方を考える前提になる都市計画情報を確認できます。",
      boundary: "建築可否は用途地域だけで決まりません。道路・接道・地区計画・高度地区・インフラを行政や専門家へ確認します。",
      why: "「建てられる？」という疑問の入口になるから。"
    },
    {
      id: "map-aichi", icon: "🟦", name: "マップあいち",
      url: "https://maps.pref.aichi.jp/",
      areas: ["nagoya", "aichi"], sourceType: "愛知県の公的情報", access: "スマホWeb", difficulty: "少し慣れが必要",
      lookAt: "候補地に関係する、くらし・安全・環境・まちづくり等の県公開レイヤー。",
      learn: "愛知県が公開する複数分野の地域情報を、地図上で横断して探せます。",
      boundary: "市町村独自の最新情報や個別敷地の判断を網羅しません。レイヤーの作成所属・更新日も確認します。",
      why: "愛知の候補地なら、一般地図より地域固有の公的レイヤーを先に見られるから。"
    },
    {
      id: "nearby", icon: "🚉", name: "どこまで行けるマップ（仮）",
      url: "https://nearby-map.com/?station=%E5%90%8D%E5%8F%A4%E5%B1%8B&time=45&transfer=1",
      areas: ["nagoya", "aichi"], sourceType: "民間サービス", access: "スマホWeb", difficulty: "かんたん",
      lookAt: "起点駅・所要時間・乗換回数を変えたときに届く駅の広がり。",
      learn: "名古屋駅などから、鉄道移動時間を軸に候補エリアを広げられます。",
      boundary: "表示は候補探索の目安です。最新ダイヤ、徒歩・待ち時間、混雑、運休は交通事業者で確認します。",
      why: "通勤・通学なら、店の多さより先に「時間で届く範囲」を比べられるから。"
    },
    {
      id: "seamless-bus", icon: "🚌", name: "シームレスバスマップ",
      url: "https://www.rosenzu.com/~sbm/maps.html#15/35.0618/137.0078",
      areas: ["nagoya", "aichi"], sourceType: "民間・交通情報", access: "スマホWeb", difficulty: "少し慣れが必要",
      lookAt: "鉄道駅から先をつなぐ、複数事業者のバス路線の位置関係。",
      learn: "愛知周辺のバス路線を地図上で連続して眺められます。",
      boundary: "非公式で、最新改正が未反映の場合があります。時刻・運行日は各交通事業者の公式情報で確認します。",
      why: "愛知の土地探しでは、駅だけでは見落とす移動手段を補えるから。"
    },
    {
      id: "land-price", icon: "📈", name: "土地代データ",
      url: "https://tochidai.info/",
      areas: ["nagoya", "aichi", "other"], sourceType: "民間・相場入口", access: "スマホは拡大操作あり", difficulty: "かんたん",
      lookAt: "市区町村や駅周辺の公示地価・基準地価の推移と比較。",
      learn: "エリア単位の価格水準や長期推移を、比較の入口として見られます。",
      boundary: "個別物件の査定ではなく、売出価格・成約価格とも異なります。出典年と公的原典も合わせて確認します。",
      why: "価格が気になるとき、一般地図ではなく相場に特化して比較できるから。"
    },
    {
      id: "school-search", icon: "🏫", name: "学区情報の検索入口（家造.net）",
      url: "https://www.iezo.net/",
      areas: ["nagoya", "aichi", "other"], sourceType: "民間・検索入口", access: "スマホWeb", difficulty: "かんたん",
      lookAt: "検討エリアの学校名・学区情報へたどる入口。",
      learn: "学区を条件にする際、調べる学校・自治体を絞るきっかけになります。",
      boundary: "自治体公式サイトではありません。町名・番地ごとの指定校、越境、制度変更は必ず該当自治体へ確認します。",
      why: "学区を重視するなら、候補地の比較段階から確認先を具体化できるから。"
    },
    {
      id: "maps", icon: "🚶", name: "Google Maps / Street View（補助）",
      url: "https://maps.google.com/",
      areas: ["nagoya", "aichi", "other", "none"], sourceType: "民間・補助", access: "スマホWeb", difficulty: "かんたん", primaryEligible: false,
      lookAt: "施設・ルート・街路の見え方を最後に補足確認。",
      learn: "一般的な地図・経路・写真をざっと確認できます。",
      boundary: "撮影時期や時間帯が限られ、音・臭い・交通量・夜の雰囲気は分かりません。",
      why: "用途別サイトを見たあと、現地確認の補助に使えるから。"
    },
    {
      id: "flat35", icon: "🏦", name: "フラット35 ローンシミュレーション",
      url: "https://www.flat35.com/simulation-info/",
      areas: ["nagoya", "aichi", "other", "none"], sourceType: "公的機関", access: "スマホWeb", difficulty: "かんたん",
      lookAt: "借入額・返済期間・金利を変えたときの返済額。",
      learn: "購入総額を月々の返済イメージへ落とせます。",
      boundary: "実際の審査結果・金利・借入可能額を保証しません。金融機関へ確認します。",
      why: "総額だけでなく、返済の大きさまで確かめられるから。"
    }
  ];

  const recommendationPlan = {
    budget: {
      before: ["total", "flat35"], compare: ["reinfolib", "total"], found: ["total", "flat35"],
      visit: ["total", "reinfolib"], apply: ["total", "flat35"], finance: ["total", "flat35"]
    },
    hazard: {
      before: ["hazard", "gsi"], compare: ["hazard", "gsi"], found: ["hazard", "gsi"],
      visit: ["hazard", "gsi"], apply: ["hazard", "gsi"], finance: ["hazard", "gsi"]
    },
    commute: {
      before: ["nearby", "seamless-bus", "mahoroba-map"], compare: ["nearby", "seamless-bus", "mahoroba-map"],
      found: ["seamless-bus", "nearby", "mahoroba-map"], visit: ["seamless-bus", "nearby", "mahoroba-map"],
      apply: ["nearby", "mahoroba-map"], finance: ["nearby", "mahoroba-map"]
    },
    price: {
      before: ["land-price", "reinfolib"], compare: ["land-price", "reinfolib"], found: ["reinfolib", "land-price"],
      visit: ["reinfolib", "land-price"], apply: ["reinfolib", "land-price"], finance: ["land-price", "reinfolib"]
    },
    build: {
      before: ["map-aichi", "urban", "gsi"], compare: ["map-aichi", "urban", "gsi"],
      found: ["map-aichi", "urban", "gsi"], visit: ["map-aichi", "urban", "gsi"],
      apply: ["map-aichi", "urban", "gsi"], finance: ["reinfolib", "gsi"]
    },
    school: {
      before: ["school-search", "map-aichi", "mahoroba-map"], compare: ["school-search", "map-aichi", "mahoroba-map"],
      found: ["school-search", "map-aichi", "mahoroba-map"], visit: ["school-search", "map-aichi", "mahoroba-map"],
      apply: ["school-search", "mahoroba-map"], finance: ["school-search", "mahoroba-map"]
    },
    local: {
      before: ["map-aichi", "mahoroba-map"], compare: ["map-aichi", "mahoroba-map"],
      found: ["map-aichi", "mahoroba-map"], visit: ["map-aichi", "mahoroba-map"],
      apply: ["map-aichi", "mahoroba-map"], finance: ["map-aichi", "mahoroba-map"]
    },
    unknown: {
      before: ["map-aichi", "mahoroba-map", "total"], compare: ["map-aichi", "mahoroba-map", "reinfolib"],
      found: ["map-aichi", "reinfolib", "mahoroba-map"], visit: ["map-aichi", "reinfolib", "mahoroba-map"],
      apply: ["total", "reinfolib"], finance: ["total", "flat35"]
    }
  };

  function labelFor(list, id) {
    const found = list.find((item) => item.id === id);
    return found ? found.label : "";
  }

  function recommendToolIds(answers) {
    if (!answers || !recommendationPlan[answers.concern] || !recommendationPlan[answers.concern][answers.stage]) return [];
    return recommendationPlan[answers.concern][answers.stage]
      .filter((id) => {
        const tool = tools.find((item) => item.id === id);
        return tool && tool.primaryEligible !== false && tool.areas.includes(answers.area);
      })
      .slice(0, 2);
  }

  function renderChoices(target, items, key, buttonId) {
    const element = document.getElementById(target);
    element.innerHTML = items.map((item) => `
      <button class="choice" type="button" data-id="${item.id}" aria-pressed="false" onclick="pick('${target}','${key}','${item.id}','${buttonId}')">
        <span class="icon" aria-hidden="true">${item.icon}</span>
        <span><span class="label">${item.label}</span><span class="sub">${item.sub}</span></span>
      </button>`).join("");
  }

  function pick(target, key, id, buttonId) {
    state[key] = id;
    document.querySelectorAll(`#${target} .choice`).forEach((button) => {
      const selected = button.dataset.id === id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.getElementById(buttonId).disabled = false;
  }

  function go(sceneIndex) {
    document.querySelectorAll(".scene").forEach((scene) => {
      scene.classList.toggle("active", Number(scene.dataset.scene) === sceneIndex);
    });
    const progressIndex = Math.min(sceneIndex, 4);
    document.querySelectorAll("#progress i").forEach((bar, index) => bar.classList.toggle("on", index <= progressIndex));
    document.querySelectorAll(".step-chip").forEach((chip, index) => {
      const active = index === (sceneIndex === 0 ? 0 : sceneIndex <= 3 ? 1 : sceneIndex === 4 ? 2 : 3);
      chip.classList.toggle("active", active);
      if (active) chip.setAttribute("aria-current", "step"); else chip.removeAttribute("aria-current");
    });
    const activeScene = document.querySelector(`.scene[data-scene="${sceneIndex}"]`);
    if (activeScene) activeScene.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function contextReason(tool) {
    const concern = labelFor(concerns, state.concern);
    const stage = labelFor(stages, state.stage);
    return `「${concern}」を、${stage}の段階で確かめる入口として役割が合うためです。${tool.why}`;
  }

  function showResults() {
    const ids = recommendToolIds(state);
    const picked = ids.map((id) => tools.find((tool) => tool.id === id)).filter(Boolean);
    state.recommended = picked.map((tool) => tool.name);
    const concern = labelFor(concerns, state.concern);
    const stage = labelFor(stages, state.stage);
    const countText = picked.length === 1 ? "この1つ" : "この2つ";

    document.getElementById("resultSpeech").innerHTML = `
      <div class="guide-name">まほろばあちゃん</div>
      <strong>「${concern}」が気になっていて、今は「${stage}」なんだね。</strong><br>
      なら、今日は${countText}から見てみると良さそうだよ。`;
    document.getElementById("resultHeading").textContent = `今のあなたなら、まず${countText}。`;
    document.getElementById("results").innerHTML = picked.map((tool, index) => `
      <article class="tool-card">
        <div class="tool-head"><div class="tool-icon" aria-hidden="true">${tool.icon}</div><div>
          <div class="tool-title">${index + 1}. ${tool.name}</div>
          <div class="badges"><span class="badge">${tool.sourceType}</span><span class="badge">${tool.access}</span><span class="badge">${tool.difficulty}</span></div>
        </div></div>
        <div class="why-box"><strong>なぜ今これ？</strong><br>${contextReason(tool)}</div>
        <div class="meta"><div><strong>まず見るところ：</strong>${tool.lookAt}</div><div><strong>分かること：</strong>${tool.learn}</div><div><strong>分からないこと・境界：</strong>${tool.boundary}</div></div>
        <a class="tool-link" href="${tool.url}" target="_blank" rel="noopener noreferrer" data-tool-id="${tool.id}">このサイトを見てみる <span aria-hidden="true">↗</span></a>
        <details><summary>推薦の根拠を見る</summary><p>回答「${concern}」「${stage}」「${labelFor(areas, state.area)}」を必須条件として照合しました。これは正解判定ではなく、次の確認候補です。</p></details>
      </article>`).join("") + (["commute", "local"].includes(state.concern) ? `<p class="tiny">補助：施設・経路・写真を最後に確認するときは、<a href="https://maps.google.com/" target="_blank" rel="noopener noreferrer">Google Maps / Street View</a>も使えます。最初の推薦には含めていません。</p>` : "");
    go(4);
  }

  function setFeedback(button, value) {
    state.feedback = value;
    document.querySelectorAll("#feedbackGrid button").forEach((item) => {
      item.classList.remove("selected");
      item.setAttribute("aria-pressed", "false");
    });
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[character]);
  }

  function finish() {
    const memo = document.getElementById("memo").value.trim();
    const rows = [
      ["いま気になること", labelFor(concerns, state.concern)],
      ["検討の段階", labelFor(stages, state.stage)],
      ["エリア", labelFor(areas, state.area)],
      ["今日案内した道具", state.recommended.join(" / ")],
      ["見たあとの感覚", state.feedback || "まだ決めていない"]
    ];
    if (memo) rows.push(["メモ", memo]);
    document.getElementById("finalSummary").innerHTML = rows.map((row) => `<div class="summary-row"><span>${row[0]}</span><strong>${escapeHtml(row[1])}</strong></div>`).join("");
    go(6);
  }

  function restart() {
    Object.assign(state, { concern: null, stage: null, area: null, feedback: null, recommended: [] });
    document.querySelectorAll(".choice").forEach((button) => { button.classList.remove("selected"); button.setAttribute("aria-pressed", "false"); });
    ["next1", "next2", "next3"].forEach((id) => { document.getElementById(id).disabled = true; });
    document.querySelectorAll("#feedbackGrid button").forEach((button) => { button.classList.remove("selected"); button.setAttribute("aria-pressed", "false"); });
    document.getElementById("memo").value = "";
    go(0);
  }

  function markBrokenCharacter(image) {
    image.hidden = true;
    const guide = image.closest(".guide");
    if (guide) guide.classList.add("character-missing");
  }

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    const validConcernIds = concerns.map((item) => item.id);
    const validStageIds = stages.map((item) => item.id);
    const validAreaIds = areas.map((item) => item.id);
    const controller = new AbortController();
    const registration = context.registerTool({
      name: "get_land_guide_recommendations",
      title: "土地探しの道案内を表示",
      description: "関心、検討段階、エリアの3回答を画面へ反映し、根拠付きの確認先を1〜2件表示します。回答は送信・保存しません。",
      inputSchema: {
        type: "object",
        properties: {
          concern: { type: "string", enum: validConcernIds },
          stage: { type: "string", enum: validStageIds },
          area: { type: "string", enum: validAreaIds }
        },
        required: ["concern", "stage", "area"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !validConcernIds.includes(input.concern) || !validStageIds.includes(input.stage) || !validAreaIds.includes(input.area)) {
          throw new TypeError("concern、stage、areaには表示されている選択肢のIDを指定してください。");
        }
        state.concern = input.concern;
        state.stage = input.stage;
        state.area = input.area;
        showResults();
        return {
          recommendations: recommendToolIds(state),
          message: "根拠付きの確認先を画面に表示しました。"
        };
      }
    }, { signal: controller.signal });
    Promise.resolve(registration).catch(() => controller.abort());
  }

  function boot() {
    renderChoices("concernChoices", concerns, "concern", "next1");
    renderChoices("stageChoices", stages, "stage", "next2");
    renderChoices("areaChoices", areas, "area", "next3");
    document.querySelectorAll(".character-image").forEach((image) => {
      image.addEventListener("error", () => markBrokenCharacter(image), { once: true });
      if (image.complete && image.naturalWidth === 0) markBrokenCharacter(image);
    });
    go(0);
    registerWebMcp();
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    Object.assign(window, { pick, go, showResults, setFeedback, finish, restart });
    window.__BAACHAN_GUIDE__ = { concerns, stages, areas, tools, recommendationPlan, recommendToolIds };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { concerns, stages, areas, tools, recommendationPlan, recommendToolIds };
  }
})();

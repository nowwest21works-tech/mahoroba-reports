(function () {
  "use strict";

  const state = { concern: null, stage: null, area: null, feedback: null, recommended: [] };

  const concerns = [
    { id: "budget", icon: "💴", label: "予算・総額", sub: "土地以外に、結局いくら必要？" },
    { id: "hazard", icon: "🌊", label: "災害・安全性", sub: "水害・地震・地盤が気になる" },
    { id: "area", icon: "🗺️", label: "エリア・立地", sub: "通勤・周辺環境・相場を見たい" },
    { id: "build", icon: "🏗️", label: "建てられるか", sub: "用途地域・道路・法規制が不安" },
    { id: "life", icon: "👨‍👩‍👧", label: "暮らし・学校", sub: "学校・生活環境・街の感じが気になる" },
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
      id: "mahoroba-map", icon: "🗺️", name: "まほろばマップ",
      url: "https://nowwest21works-tech.github.io/mahoroba-reports/map-circles/",
      areas: ["nagoya", "aichi", "other", "none"], official: "まほろば", difficulty: "かんたん",
      learn: "駅・学校・施設などとの距離感を、地図で直感的に見る。",
      caution: "距離だけでは、渋滞・坂道・騒音・街の雰囲気までは分かりません。",
      why: "場所の感覚をつかむ入口として使いやすいから。"
    },
    {
      id: "total", icon: "🧮", name: "土地購入 総額シミュレータ",
      url: "https://land-purchase-build-a.nowwest21works.chatgpt.site/",
      areas: ["nagoya", "aichi", "other", "none"], official: "まほろば", difficulty: "かんたん",
      learn: "土地価格だけでなく、諸費用まで含めた購入総額の目安。",
      caution: "個別の融資条件・税制・建築条件などで実額は変わります。",
      why: "『土地価格』と『本当に必要な総額』を分けて考えられるから。"
    },
    {
      id: "hazard", icon: "🌊", name: "重ねるハザードマップ",
      url: "https://disaportal.gsi.go.jp/",
      areas: ["nagoya", "aichi", "other", "none"], official: "国土交通省・国土地理院", difficulty: "かんたん",
      learn: "洪水・土砂災害・高潮・津波などの想定区域を重ねて確認。",
      caution: "色が付いていない場所＝安全、ではありません。地形・過去の浸水・現地排水も別途確認。",
      why: "災害が気になるときの最初の公的確認先だから。"
    },
    {
      id: "gsi", icon: "⛰️", name: "地理院地図",
      url: "https://maps.gsi.go.jp/",
      areas: ["nagoya", "aichi", "other", "none"], official: "国土地理院", difficulty: "少し慣れが必要",
      learn: "標高、地形、古い航空写真などから土地の成り立ちを見る。",
      caution: "個別敷地の地盤強度や排水性能を直接示すものではありません。",
      why: "ハザードの色だけでなく、地形そのものを見るため。"
    },
    {
      id: "reinfolib", icon: "📊", name: "不動産情報ライブラリ",
      url: "https://www.reinfolib.mlit.go.jp/",
      areas: ["nagoya", "aichi", "other", "none"], official: "国土交通省", difficulty: "少し慣れが必要",
      learn: "取引価格・地価・都市計画など、不動産判断の基礎データ。",
      caution: "過去取引や公的地価は、目の前の土地の成約価格そのものではありません。",
      why: "売出価格だけでなく、公的データから周辺を眺め直せるから。"
    },
    {
      id: "urban", icon: "🏗️", name: "不動産情報ライブラリ｜都市計画情報",
      url: "https://www.reinfolib.mlit.go.jp/",
      areas: ["nagoya", "aichi", "other", "none"], official: "国土交通省", difficulty: "少し慣れが必要",
      learn: "用途地域など、土地利用・都市計画に関する情報。",
      caution: "建築可否は用途地域だけでは決まりません。道路・接道・地区計画・高度地区・インフラ等を行政や専門家へ確認してください。",
      why: "『建てられる？』という疑問の入口になるから。"
    },
    {
      id: "maps", icon: "🚶", name: "Google Maps / Street View",
      url: "https://maps.google.com/",
      areas: ["nagoya", "aichi", "other", "none"], official: "民間", difficulty: "かんたん",
      learn: "周辺施設・ルート・街路の見え方をざっと確認。",
      caution: "撮影時期や時間帯が限られます。現地での音・臭い・交通量・夜の雰囲気は別物です。",
      why: "『暮らす目線』で周辺をざっと見直しやすいから。"
    },
    {
      id: "flat35", icon: "🏦", name: "フラット35 ローンシミュレーション",
      url: "https://www.flat35.com/simulation-info/",
      areas: ["nagoya", "aichi", "other", "none"], official: "住宅金融支援機構", difficulty: "かんたん",
      learn: "借入額・返済額のシミュレーション。",
      caution: "実際の審査結果・金利・借入可能額を保証するものではありません。金融機関へ確認してください。",
      why: "総額だけでなく、月々の返済イメージへ落とせるから。"
    },
    {
      id: "school", icon: "🏫", name: "各自治体 小中学校区情報",
      url: "https://www.google.com/search?q=%E5%B0%8F%E4%B8%AD%E5%AD%A6%E6%A0%A1%E5%8C%BA+%E8%87%AA%E6%B2%BB%E4%BD%93",
      areas: ["nagoya", "aichi", "other"], official: "自治体", difficulty: "かんたん",
      learn: "候補地の通学区域・指定校の確認。",
      caution: "学区や制度は変更されることがあります。最終的には該当自治体の公式情報で確認。",
      why: "暮らしの条件として学区が重要なら、早めに事実確認した方がよいから。"
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
    area: {
      before: ["mahoroba-map", "maps"], compare: ["mahoroba-map", "maps"], found: ["mahoroba-map", "maps"],
      visit: ["maps", "mahoroba-map"], apply: ["reinfolib", "mahoroba-map"], finance: ["reinfolib", "mahoroba-map"]
    },
    build: {
      before: ["gsi", "reinfolib"], compare: ["gsi", "reinfolib"], found: ["urban", "gsi"],
      visit: ["urban", "gsi"], apply: ["urban", "gsi"], finance: ["reinfolib", "gsi"]
    },
    life: {
      before: ["mahoroba-map", "maps"], compare: ["maps", "school"], found: ["maps", "school"],
      visit: ["maps", "school"], apply: ["maps", "mahoroba-map"], finance: ["maps", "mahoroba-map"]
    },
    unknown: {
      before: ["mahoroba-map", "total"], compare: ["mahoroba-map", "reinfolib"], found: ["reinfolib", "total"],
      visit: ["mahoroba-map", "reinfolib"], apply: ["total", "reinfolib"], finance: ["total", "flat35"]
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
        return tool && tool.areas.includes(answers.area);
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
          <div class="badges"><span class="badge">${tool.official}</span><span class="badge">${tool.difficulty}</span></div>
        </div></div>
        <div class="why-box"><strong>なぜ今これ？</strong><br>${contextReason(tool)}</div>
        <div class="meta"><div><strong>分かること：</strong>${tool.learn}</div><div><strong>ここでは分からない／注意：</strong>${tool.caution}</div></div>
        <a class="tool-link" href="${tool.url}" target="_blank" rel="noopener noreferrer" data-tool-id="${tool.id}">このサイトを見てみる <span aria-hidden="true">↗</span></a>
        <details><summary>推薦の根拠を見る</summary><p>回答「${concern}」「${stage}」「${labelFor(areas, state.area)}」を必須条件として照合しました。これは正解判定ではなく、次の確認候補です。</p></details>
      </article>`).join("");
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

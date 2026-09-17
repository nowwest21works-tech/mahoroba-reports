"use strict";

const assert = require("node:assert/strict");
const { concerns, stages, areas, tools, recommendationPlan, recommendToolIds } = require("../dist/assets/app.js");

const toolIds = new Set(tools.map((tool) => tool.id));
let combinationCount = 0;

for (const concern of concerns) {
  assert.ok(recommendationPlan[concern.id], `plan missing for concern: ${concern.id}`);
  for (const stage of stages) {
    assert.ok(recommendationPlan[concern.id][stage.id], `plan missing for ${concern.id}/${stage.id}`);
    for (const area of areas) {
      const ids = recommendToolIds({ concern: concern.id, stage: stage.id, area: area.id });
      combinationCount += 1;
      assert.ok(ids.length >= 1 && ids.length <= 2, `expected 1-2 results for ${concern.id}/${stage.id}/${area.id}`);
      assert.equal(new Set(ids).size, ids.length, `duplicate result for ${concern.id}/${stage.id}/${area.id}`);
      ids.forEach((id) => assert.ok(toolIds.has(id), `unknown tool id: ${id}`));
      assert.ok(!ids.includes("maps"), `Google Maps must not be a primary recommendation: ${concern.id}/${stage.id}/${area.id}`);
    }
  }
}

for (const stage of stages) {
  for (const area of areas) {
    assert.deepEqual(
      recommendToolIds({ concern: "hazard", stage: stage.id, area: area.id }),
      ["hazard", "gsi"],
      `hazard pairing must combine public hazard layers with terrain context for ${stage.id}/${area.id}`
    );
  }
}

assert.deepEqual(recommendToolIds({ concern: "unknown", stage: "before", area: "none" }), ["mahoroba-map", "total"]);
assert.deepEqual(recommendToolIds({ concern: "build", stage: "found", area: "aichi" }), ["map-aichi", "urban"]);
assert.deepEqual(recommendToolIds({ concern: "build", stage: "found", area: "other" }), ["urban", "gsi"]);
assert.deepEqual(recommendToolIds({ concern: "commute", stage: "compare", area: "nagoya" }), ["nearby", "seamless-bus"]);
assert.deepEqual(recommendToolIds({ concern: "commute", stage: "compare", area: "other" }), ["mahoroba-map"]);
assert.deepEqual(recommendToolIds({ concern: "price", stage: "compare", area: "aichi" }), ["land-price", "reinfolib"]);
assert.deepEqual(recommendToolIds({ concern: "school", stage: "found", area: "nagoya" }), ["school-search", "map-aichi"]);
assert.deepEqual(recommendToolIds({ concern: "budget", stage: "finance", area: "nagoya" }), ["total", "flat35"]);
assert.notDeepEqual(
  recommendToolIds({ concern: "commute", stage: "before", area: "aichi" }),
  recommendToolIds({ concern: "commute", stage: "found", area: "aichi" }),
  "stage must affect transport recommendations"
);

tools.forEach((tool) => {
  assert.match(tool.url, /^https:\/\//, `external URL must use HTTPS: ${tool.id}`);
  ["sourceType", "access", "lookAt", "learn", "boundary", "why"].forEach((field) => {
    assert.ok(tool[field], `${field} must be present: ${tool.id}`);
  });
});
assert.equal(tools.find((tool) => tool.id === "school-search").sourceType, "民間・検索入口");
assert.equal(tools.find((tool) => tool.id === "maps").primaryEligible, false);
assert.equal(combinationCount, concerns.length * stages.length * areas.length);
console.log(`recommendation tests passed: ${combinationCount} combinations`);

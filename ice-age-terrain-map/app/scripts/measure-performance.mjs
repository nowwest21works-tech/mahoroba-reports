import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const baseUrl = process.env.PERFORMANCE_BASE_URL ?? "http://127.0.0.1:4174";
const outputUrl = new URL("../../outputs/phase2/web-performance.json", import.meta.url);
const runs = [];
const browser = await chromium.launch();

for (let index = 0; index < 3; index += 1) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const dataResponses = [];
  page.on("response", (response) => {
    if (response.url().includes("/data/")) {
      dataResponses.push({
        url: response.url(),
        status: response.status(),
        content_range: response.headers()["content-range"] ?? null,
      });
    }
  });
  const startedAt = performance.now();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator(".map-status").waitFor({ state: "detached" });
  const readyMs = Math.round((performance.now() - startedAt) * 10) / 10;
  await page.waitForTimeout(1500);
  const browserMetrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance
      .getEntriesByType("resource")
      .map((entry) => ({
        name: entry.name,
        duration_ms: Math.round(entry.duration * 10) / 10,
        transfer_bytes: entry.transferSize,
        encoded_body_bytes: entry.encodedBodySize,
      }))
      .filter(
        (entry) =>
          entry.name.includes("/assets/") ||
          entry.name.includes("/data/") ||
          entry.name.endsWith(".pmtiles"),
      );
    return {
      dom_content_loaded_ms: Math.round(navigation.domContentLoadedEventEnd * 10) / 10,
      load_event_ms: Math.round(navigation.loadEventEnd * 10) / 10,
      resources,
    };
  });
  runs.push({
    run: index + 1,
    ui_ready_ms: readyMs,
    data_responses: dataResponses,
    ...browserMetrics,
  });
  await context.close();
}

await browser.close();
const sorted = runs.map((run) => run.ui_ready_ms).sort((a, b) => a - b);
const report = {
  measured_at: new Date().toISOString(),
  environment: "local Vite production preview, Chromium, 1440x900",
  url: baseUrl,
  run_count: runs.length,
  median_ui_ready_ms: sorted[Math.floor(sorted.length / 2)],
  runs,
};

const outputPath = fileURLToPath(outputUrl);
await mkdir(fileURLToPath(new URL(".", outputUrl)), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

import { expect, test, type Page } from "@playwright/test";

const monitorConsole = (page: Page) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

test("initial screen, sea-level switch, layers, camera, and point work", async ({
  page,
}) => {
  const errors = monitorConsole(page);
  const requestedUrls: string[] = [];
  page.on("request", (request) => requestedUrls.push(request.url()));
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "約20,000年前の地形を想像する" }),
  ).toBeVisible();
  await expect(page.getByText("Phase 2 Preview · 概算モデル")).toBeVisible();
  await expect(page.getByTestId("map")).toBeVisible();
  await expect(page.locator(".map-status")).toHaveCount(0);
  await expect(page.locator("output")).toHaveText("−120m");
  expect([...new Set(requestedUrls.filter((url) => url.endsWith(".pmtiles")))]).toEqual([
    expect.stringContaining("japan-minus-120m.pmtiles"),
  ]);
  expect(requestedUrls.some((url) => url.endsWith("rivers.geojson"))).toBe(false);

  const slider = page.getByTestId("sea-level");
  await slider.fill("-100");
  await expect(page.locator("output")).toHaveText("−100m");
  await expect(page).toHaveURL(/sea=-100/);
  await expect(page.getByText("時代プリセットから変更されています")).toBeVisible();

  const rivers = page.getByRole("checkbox", { name: "現在主要河川" });
  await expect(rivers).not.toBeChecked();
  await rivers.check();
  await expect(rivers).toBeChecked();
  await expect(page).toHaveURL(/layers=[^&]*rivers/);

  await page.evaluate(() => {
    window.__ICE_AGE_MAP__?.jumpTo({ center: [138.2, 36.1], zoom: 6.2 });
  });
  await expect.poll(() => new URL(page.url()).searchParams.get("zoom")).toBe("6.2");
  const before = await page.evaluate(() => {
    const center = window.__ICE_AGE_MAP__?.getCenter();
    return center && [center.lng, center.lat, window.__ICE_AGE_MAP__?.getZoom()];
  });
  await slider.fill("-95");
  const after = await page.evaluate(() => {
    const center = window.__ICE_AGE_MAP__?.getCenter();
    return center && [center.lng, center.lat, window.__ICE_AGE_MAP__?.getZoom()];
  });
  expect(after).toEqual(before);

  await page.getByRole("button", { name: "東京湾の解説を開く" }).click();
  await expect(page.getByRole("heading", { name: "東京湾" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DATA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MODEL" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "STORY" })).toBeVisible();
  await expect(page).toHaveURL(/point=tokyo-bay/);

  expect(errors).toEqual([]);
});

test("URL state reloads", async ({ page }) => {
  const errors = monitorConsole(page);
  await page.goto(
    "/?sea=-100&lat=35.4&lng=136.8&zoom=5&layers=land,coast,cities,points,uncertainty&point=soya-strait",
  );

  await expect(page.locator("output")).toHaveText("−100m");
  await expect(page.getByRole("heading", { name: "宗谷海峡" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "現在主要河川" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "現在海岸線" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("360px layout has no horizontal overflow", async ({ page }) => {
  const errors = monitorConsole(page);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.getByTestId("map")).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);

  await page.getByRole("button", { name: "この地図について" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(errors).toEqual([]);
});

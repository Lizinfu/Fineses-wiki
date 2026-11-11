import { expect, test } from "@playwright/test";

const cityRoute = "/nations/nat-inibholc/region/cathair/";

async function expectNoHorizontalOverflow(page) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
}

for (const route of [cityRoute, "/nations/nat-havfrentyr/region/moryhavn/"]) {
test(`an ending float becomes a full-column figure above its appendix: ${route}`, async ({ page }) => {
  await page.goto(route);
  const figure = page.locator(".entity-content .media-figure");
  await expect(figure).toBeVisible();
  await expect(figure.locator("img")).toHaveJSProperty("complete", true);
  const layout = await page.evaluate(() => {
    const article = document.querySelector(".entity-content");
    const figure = article.querySelector(".media-figure");
    const appendix = document.querySelector(".entity-appendix");
    return {
      article: article.getBoundingClientRect().toJSON(),
      figure: figure.getBoundingClientRect().toJSON(),
      appendix: appendix.getBoundingClientRect().toJSON(),
      float: getComputedStyle(figure).float,
      viewport: window.innerWidth,
      captionMarker: getComputedStyle(figure.querySelector("figcaption"), "::before").content,
    };
  });
  expect(layout.article.bottom).toBeGreaterThanOrEqual(layout.figure.bottom - 1);
  expect(layout.appendix.y).toBeGreaterThanOrEqual(layout.figure.bottom);
  expect(layout.appendix.width).toBeGreaterThan(layout.article.width * .9);
  expect(layout.float).toBe("none");
  expect(layout.figure.width).toBeGreaterThanOrEqual(layout.article.width - 1);
  expect(["none", "normal"]).toContain(layout.captionMarker);
  await expectNoHorizontalOverflow(page);
});
}

test("city image framing preserves the complete source aspect ratio", async ({ page }) => {
  await page.goto(cityRoute);
  const image = page.locator('.media-figure[data-frame="portrait"] img');
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveJSProperty("complete", true);
  const imageRatio = await image.evaluate(image => {
    const bounds = image.getBoundingClientRect();
    return { displayed: bounds.width / bounds.height, source: image.naturalWidth / image.naturalHeight };
  });
  expect(imageRatio.displayed).toBeCloseTo(imageRatio.source, 2);
});

test("media captions, pairs and map metadata wrap inside the reading column", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(cityRoute);
  // Exercise the real stylesheet with editorial cases that do not yet occur in published content.
  // The document source remains unchanged; all fixtures exist only in this browser page.
  await page.locator(".entity-content").evaluate((article) => {
    const image = '<img alt="媒体排版测试图" width="800" height="450" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22450%22%3E%3Cpath fill=%22%233a4c58%22 d=%22M0 0h800v450H0z%22/%3E%3C/svg%3E">';
    const longCredit = "https://archive.example/" + "source-without-a-break-".repeat(10);
    article.innerHTML = `
      <figure class="media-figure" data-layout="float-start" data-size="small">
        <a class="media-figure__media">${image}</a>
        <figcaption class="media-figure__caption"><span>较长的图片说明，应该在浮图宽度内自然换行。</span><cite>${longCredit}</cite></figcaption>
      </figure>
      <p>${"段落应当绕过浮图，后续独立媒体应回到完整阅读列。".repeat(12)}</p>
      <section class="media-pair" data-layout="wide-start"><h3 class="media-pair__title">并排媒体</h3><div class="media-pair__items">
        <figure class="media-pair__item"><a>${image}</a><figcaption><strong>标签</strong><span>${longCredit}</span></figcaption></figure>
        <figure class="media-pair__item"><a>${image}</a><figcaption><span>仅有说明的图片也应保持单列图注。</span></figcaption></figure>
      </div></section>
      <figure class="map-plate"><header class="map-plate__header"><span>MAP PLATE</span><strong>地图图版与较长标题</strong></header>
        <a class="map-plate__media">${image}</a>
        <figcaption class="map-plate__meta"><p>地图说明应与图例分区，宽度不足时自然换行，不挤压图注。</p><dl><div><dt>来源</dt><dd>${longCredit}</dd></div></dl></figcaption>
      </figure>
      <figure class="content-figure"><a class="content-figure__media">${image}</a><figcaption class="content-figure__caption">普通 Markdown 图片仍保留 FIG. 图注标识。${longCredit}</figcaption></figure>
      <div class="archive-gallery" style="--gallery-columns:3"><a class="archive-gallery__item">${image}<span class="archive-gallery__caption"><strong>图库中的缩略图</strong></span></a><a class="archive-gallery__item">${image}</a><a class="archive-gallery__item">${image}</a></div>
      <figure class="media-figure" data-layout="float-end" data-size="small"><a class="media-figure__media">${image}</a><figcaption class="media-figure__caption"><cite>尾图保留 small 的最大宽度。</cite></figcaption></figure>
    `;
  });
  const measurements = await page.evaluate(() => {
    const article = document.querySelector(".entity-content");
    const floatElement = article.querySelector(".media-figure");
    const float = floatElement.getBoundingClientRect();
    const endingFigure = article.querySelector(".media-figure:last-child");
    const pair = article.querySelector(".media-pair").getBoundingClientRect();
    const pairCaption = article.querySelector(".media-pair__item figcaption");
    const mapCaption = article.querySelector(".map-plate__meta");
    const regularCaption = article.querySelector(".content-figure__caption");
    return {
      floatBottom: float.bottom,
      floatWidth: float.width,
      floatStyle: getComputedStyle(floatElement).float,
      articleWidth: article.getBoundingClientRect().width,
      viewport: window.innerWidth,
      endingFloat: getComputedStyle(endingFigure).float,
      endingWidth: endingFigure.getBoundingClientRect().width,
      pairTop: pair.y,
      pairCaptionMarker: getComputedStyle(pairCaption, "::before").content,
      mapCaptionMarker: getComputedStyle(mapCaption, "::before").content,
      regularCaptionMarker: getComputedStyle(regularCaption, "::before").content,
      containers: [...article.querySelectorAll("figure, figcaption, .media-pair, .map-plate__meta dd, .archive-gallery")].map(el => ({
        tag: el.className || el.tagName,
        overflow: el.scrollWidth - el.clientWidth,
      })),
    };
  });
  if (measurements.viewport > 768) {
    expect(measurements.floatStyle).toBe("inline-start");
    expect(measurements.floatWidth).toBeCloseTo(measurements.articleWidth * .44, 0);
  } else {
    expect(measurements.floatStyle).toBe("none");
    expect(measurements.floatWidth).toBeCloseTo(measurements.articleWidth, 0);
  }
  expect(measurements.endingFloat).toBe("none");
  expect(measurements.endingWidth).toBeCloseTo(Math.min(measurements.articleWidth, 320), 0);
  expect(measurements.pairTop).toBeGreaterThanOrEqual(measurements.floatBottom);
  expect(["none", "normal"]).toContain(measurements.pairCaptionMarker);
  expect(["none", "normal"]).toContain(measurements.mapCaptionMarker);
  expect(measurements.regularCaptionMarker).toContain("FIG.");
  expect(measurements.containers.filter(c => c.overflow > 1)).toEqual([]);
  await expectNoHorizontalOverflow(page);
});

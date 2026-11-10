import { expect, test } from "@playwright/test";

async function dismissAnnouncement(page) {
  const dialog = page.locator("#library-announcement");
  if (await dialog.isVisible()) await dialog.locator("[data-announcement-close]").click();
}

test("motion preference persists across normal page navigation and reload", async ({ page }) => {
  await page.goto("/");
  await dismissAnnouncement(page);
  const control = page.locator("[data-motion-toggle]:visible").first();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".archive-particles")).toBeHidden();

  await page.goto("/nations/nat-inibholc/");
  await expect(page.locator("h1")).toHaveText("伊琳沃克");
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".archive-particles")).toBeVisible();
});

test("reduced motion overrides a saved enabled preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("world-library-motion", "on"));
  await page.goto("/nations/nat-inibholc/");
  const control = page.locator("[data-motion-toggle]:visible").first();
  await expect(control).toBeDisabled();
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".archive-particles")).toBeHidden();
  await expect(page.locator("html")).not.toHaveAttribute("data-motion-entering");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(control).toBeEnabled();
  await expect(control).toHaveAttribute("aria-pressed", "true");
});

test("motion leaves atlas, search and timeline content free of decorative canvases", async ({ page }) => {
  for (const route of ["/portals/atlas/", "/search/", "/timeline/"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".archive-particles")).toHaveCount(0);
  }
});

test("native links and history retain readable content with motion disabled", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("world-library-motion", "off"));
  await page.goto("/nations/nat-inibholc/");
  await page.locator(".site-header__brand").click();
  await dismissAnnouncement(page);
  await expect(page.locator("#home-title")).toBeVisible();
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("伊琳沃克");
  await expect(page.locator(".entity-content")).toContainText("伊琳沃克第三帝国");
  await expect(page.locator("html")).not.toHaveAttribute("data-motion-entering");
});

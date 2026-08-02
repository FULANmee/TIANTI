import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function resetState(request: APIRequestContext) {
  const response = await request.post("/api/test/reset");
  expect(response.ok()).toBeTruthy();
}

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.locator('input[name="email"]').fill("lin@example.com");
  await page.locator('input[name="password"]').fill("changeme-one");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test("public homepage renders and links into talent detail", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TIANTI" })).toBeVisible();
  await page.getByTestId("home-cta-talents").click();
  await expect(page).toHaveURL(/\/talents$/);
  await page.getByRole("link", { name: "青鸾" }).first().click();
  await expect(page).toHaveURL(/\/talents\/(qingluan|talent-qingluan)$/);
  await expect(page.getByRole("heading", { name: "青鸾" })).toBeVisible();
});

test("legacy schedule and admin event routes redirect into archive views", async ({ page }) => {
  await page.goto("/schedule?q=青鸾&status=confirmed");
  await expect(page).toHaveURL(/\/events\?/);

  const scheduleUrl = new URL(page.url());
  expect(scheduleUrl.pathname).toBe("/events");
  expect(scheduleUrl.searchParams.get("eventStatus")).toBe("future");
  expect(scheduleUrl.searchParams.get("q")).toBe("青鸾");
  expect(scheduleUrl.searchParams.get("participationStatus")).toBeNull();

  await login(page);
  await page.goto("/admin/events");
  await expect(page).toHaveURL(/\/admin\/archives$/);
});

test("editor can update ladder subtitle while the derived title stays public", async ({ page }) => {
  await login(page);

  await page.goto("/admin/ladder");
  await expect(page.getByTestId("ladder-title")).toHaveValue("凛的天梯榜");
  await page.getByTestId("ladder-subtitle").fill("CI subtitle");
  await page.getByTestId("save-ladder").click();
  await expect(page.getByText("天梯榜已保存。")).toBeVisible();
  await expect(page.getByTestId("ladder-title")).toHaveValue("凛的天梯榜");

  await page.goto("/ladder?editor=lin");
  await expect(page.getByRole("heading", { name: "凛的天梯榜" })).toBeVisible();
  await expect(page.getByText("CI subtitle")).toBeVisible();
});

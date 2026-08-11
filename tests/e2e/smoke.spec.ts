import path from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

const sceneUploadPath = path.join(process.cwd(), "public", "media", "poster-crimson.svg");
const sharedUploadPath = path.join(process.cwd(), "public", "media", "shared-bloom.svg");
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getFutureDateKey(daysFromNow: number) {
  return shanghaiDateFormatter.format(new Date(Date.now() + daysFromNow * DAY_IN_MS));
}

function getShortDateLabel(dateKey: string) {
  return `${dateKey.slice(5, 7)}.${dateKey.slice(8, 10)}`;
}

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

async function confirmCrop(page: Page, uploadTestId: string) {
  await page.getByTestId(`${uploadTestId}-confirm-crop`).click();
}

async function waitForArchiveSaved(page: Page) {
  await expect(page.getByText(/我的档案已保存到/)).toBeVisible({ timeout: 15_000 });
}

async function dragByTestId(page: Page, sourceTestId: string, targetTestId: string) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.getByTestId(sourceTestId).dispatchEvent("dragstart", { dataTransfer });
  await page.getByTestId(targetTestId).dispatchEvent("dragover", { dataTransfer });
  await page.getByTestId(targetTestId).dispatchEvent("drop", { dataTransfer });
  await page.getByTestId(sourceTestId).dispatchEvent("dragend", { dataTransfer });
}

async function expectGridColumnCount(locator: Locator, expectedCount: number) {
  await expect
    .poll(async () =>
      locator.evaluate((node) =>
        getComputedStyle(node)
          .gridTemplateColumns.split(" ")
          .filter(Boolean).length
      )
    )
    .toBe(expectedCount);
}

async function addLineupViaDialog(
  page: Page,
  options: {
    talentId?: string;
    talentLabel?: string;
    note?: string;
    allDates?: string[];
    dateNotes?: Record<string, string>;
  }
) {
  await page.getByTestId("add-lineup").click();
  if (options.talentId) {
    await page.getByTestId("lineup-dialog-talent").selectOption(options.talentId);
  } else if (options.talentLabel) {
    await page.getByTestId("lineup-dialog-talent").selectOption({ label: options.talentLabel });
  }

  if (options.allDates && options.dateNotes) {
    for (const date of options.allDates) {
      const checkbox = page.getByTestId(`lineup-dialog-date-${date}`);
      const shouldCheck = Object.prototype.hasOwnProperty.call(options.dateNotes, date);
      await expect(checkbox).not.toBeChecked();
      if ((await checkbox.isChecked()) !== shouldCheck) {
        await checkbox.setChecked(shouldCheck);
      }
      if (shouldCheck) {
        await page.getByTestId(`lineup-dialog-note-${date}`).fill(options.dateNotes[date] ?? "");
      }
    }
  } else if (options.note) {
    await page.getByTestId("lineup-dialog-note").fill(options.note);
  }

  await page.getByTestId("lineup-dialog-submit").click();
}

async function openSelectedEventEditor(page: Page) {
  await page.getByRole("button", { name: "编辑活动信息" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("archive-note")).toBeVisible();
}

async function addArchiveEntriesViaDialog(
  page: Page,
  entries: Array<{ talentLabel?: string; talentId?: string; date?: string; cosplayTitle?: string }>
) {
  await page.getByTestId("add-archive-entry").click();
  for (const [index, entry] of entries.entries()) {
    if (index > 0) {
      await page.getByTestId("archive-dialog-add-row").click();
    }
    if (entry.talentId) {
      await page.getByTestId(`archive-dialog-talent-${index}`).selectOption(entry.talentId);
    } else if (entry.talentLabel) {
      await page.getByTestId(`archive-dialog-talent-${index}`).selectOption({ label: entry.talentLabel });
    }
    if (entry.date) {
      await page.getByTestId(`archive-dialog-date-${index}`).selectOption(entry.date);
    }
    if (entry.cosplayTitle) {
      await page.getByTestId(`archive-dialog-cosplay-${index}`).fill(entry.cosplayTitle);
    }
  }
  await page.getByTestId("archive-dialog-submit").click();
}

test.beforeEach(async ({ request }) => {
  await resetState(request);
});

test("public homepage renders and links into talent detail", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TIANTI" })).toBeVisible();
  await expect(page.getByText("UNCONFIRMED")).toHaveCount(0);
  const featuredTalentImages = page.locator('main a[href^="/talents/"] img');
  await expect(featuredTalentImages).toHaveCount(4);
  await expect(featuredTalentImages.first()).toHaveAttribute("loading", "eager");
  await expect(featuredTalentImages.nth(1)).toHaveAttribute("loading", "lazy");
  await page.getByTestId("home-cta-talents").click();
  await expect(page).toHaveURL(/\/talents$/);
  await page.getByRole("link", { name: "青鸾" }).first().click();
  await expect(page).toHaveURL(/\/talents\/(qingluan|talent-qingluan)$/);
  await expect(page.getByRole("heading", { name: "青鸾" })).toBeVisible();
});

test("talent detail hides the optional Douyin summary when no profile exists", async ({ page }) => {
  await page.goto("/talents/talent-qingluan");

  await expect(page.getByTestId("douyin-profile-summary")).toHaveCount(0);
  await expect(page.getByText("主页行程")).toHaveCount(0);
  await expect(page.getByText("关联小号")).toHaveCount(0);
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

test("editor can create a talent with inline uploads and publish a future event", async ({ page }) => {
  const eventDate = getFutureDateKey(30);
  await login(page);

  await page.goto("/admin/talents");
  await page.getByTestId("new-talent-button").click();
  await page.locator('input[name="nickname"]').fill("Star Lume");
  await page.locator('textarea[name="bio"]').fill("A fresh showcase talent for the v3.1 acceptance flow.");
  await page.locator('input[name="mcn"]').fill("Orbit Studio");
  await page.getByTestId("talent-cover-upload").setInputFiles(sceneUploadPath);
  await confirmCrop(page, "talent-cover-upload");
  await expect(page.getByTestId("talent-cover-select")).toHaveCount(0);
  await expect(page.getByTestId("talent-cover-upload-clear")).toBeEnabled();
  await page.getByRole("button", { name: "+ 添加代表图" }).click();
  await page.getByTestId("talent-representation-upload-0").setInputFiles(sharedUploadPath);
  await confirmCrop(page, "talent-representation-upload-0");
  await expect(page.getByTestId("talent-representation-select-0")).toHaveCount(0);
  await expect(page.getByTestId("talent-representation-upload-0-clear")).toBeEnabled();
  await page.getByTestId("save-talent").click();
  await expect(page.getByText("已保存达人「Star Lume」")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/admin/archives");
  await page.getByTestId("new-event-button").click();
  await page.locator('input[name="name"]').fill("Starlight Expo");
  await page.locator('input[name="startsAt"]').fill(eventDate);
  await page.locator('input[name="endsAt"]').fill(eventDate);
  await page.locator('input[name="city"]').fill("上海");
  await page.locator('input[name="venue"]').fill("Galaxy Hall");
  await page.getByTestId("event-note").fill("Acceptance path event for TIANTI v3.1.");
  await page.getByTestId("add-lineup").click();
  await page.getByTestId("lineup-dialog-talent").selectOption({ label: "Star Lume" });
  await page.getByTestId("lineup-dialog-note").fill("Featured guest slot");
  await page.getByTestId("lineup-dialog-submit").click();
  await page.getByTestId("save-event").click();
  await expect(page).toHaveURL(/\/admin\/archives\?event=/);
  await expect(page.getByText("活动「Starlight Expo」已保存。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Starlight Expo" })).toBeVisible();

  await page.goto("/events?eventStatus=future&q=Star%20Lume");
  await expect(page.getByText("Starlight Expo")).toBeVisible();

  await page.getByRole("link", { name: /Starlight Expo/ }).first().click();
  await page.getByRole("link", { name: /Star Lume/ }).click();
  await expect(page.getByRole("link", { name: /Starlight Expo/ }).first()).toBeVisible();
});

test("editor can discover and select a Douyin profile without copying its URL", async ({ page }) => {
  await login(page);
  await page.route("**/api/admin/douyin-profile-candidates", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            nickname: "青鸾本人",
            profileUrl: "https://www.douyin.com/user/MS4wLjABAAAA-qingluan",
            exactNickname: false
          }
        ]
      })
    });
  });

  await page.goto("/admin/talents");
  await page.getByTestId("new-talent-button").click();
  await page.locator('input[name="nickname"]').fill("青鸾");
  await page.getByTestId("discover-douyin-profile").click();
  await expect(page.getByTestId("douyin-profile-candidates")).toContainText("青鸾本人");
  await page.getByRole("button", { name: "选择这个账号" }).click();
  await expect(page.locator('textarea[name="douyinProfileUrl"]')).toHaveValue(
    "https://www.douyin.com/user/MS4wLjABAAAA-qingluan"
  );
  await expect(page.getByTestId("douyin-discovery-message")).toContainText("保存后会自动校验并抓取最新作品与 MCN");
});

test("editor can quickly merge two future activities and keep the selected target", async ({ page }) => {
  const firstDate = getFutureDateKey(30);
  const secondDate = getFutureDateKey(31);
  await login(page);
  await page.goto("/admin/archives");

  for (const [name, date] of [
    ["深圳活动 A", firstDate],
    ["深圳活动 B", secondDate]
  ] as const) {
    await page.getByTestId("new-event-button").click();
    await page.locator('input[name="name"]').fill(name);
    await page.locator('input[name="startsAt"]').fill(date);
    await page.locator('input[name="endsAt"]').fill(date);
    await page.locator('input[name="city"]').fill("深圳");
    await page.getByTestId("save-event").click();
    await expect(page.getByText(`活动「${name}」已保存。`)).toBeVisible();
  }

  await page.getByRole("checkbox", { name: "选择 深圳活动 A" }).check();
  await page.getByRole("checkbox", { name: "选择 深圳活动 B" }).check();
  await page.getByTestId("bulk-merge-events").click();
  await expect(page.getByTestId("bulk-merge-dialog")).toBeVisible();
  await page.getByRole("radio", { name: "保留 深圳活动 A" }).check();
  await page.getByTestId("bulk-merge-submit").click();

  await expect(page.getByText(/已将 2 个活动合并为「深圳活动 A」/)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "选择 深圳活动 B" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "深圳活动 A" })).toBeVisible();
});

test("archive save buttons keep their pending labels independent", async ({ page }) => {
  await login(page);
  await page.goto("/admin/archives");
  await openSelectedEventEditor(page);

  const eventSaveButton = page.getByTestId("save-event");
  const archiveSaveButton = page.getByTestId("save-archive");
  await page.locator('textarea[name="note"]').fill("活动保存 pending 状态回归测试");

  let releaseEventRequest!: () => void;
  const eventRequestPaused = new Promise<void>((resolve) => {
    releaseEventRequest = resolve;
  });
  await page.route("**/api/admin/events/**", async (route) => {
    await eventRequestPaused;
    await route.continue();
  });

  await eventSaveButton.click();
  await expect(eventSaveButton).toHaveText("保存中...");
  await expect(archiveSaveButton).toHaveText("保存我的档案");
  releaseEventRequest();
  await expect(page.getByText(/活动「.+」已保存。/)).toBeVisible();
  await page.unroute("**/api/admin/events/**");

  await openSelectedEventEditor(page);
  await page.getByTestId("archive-note").fill("档案保存 pending 状态回归测试");

  let releaseArchiveRequest!: () => void;
  const archiveRequestPaused = new Promise<void>((resolve) => {
    releaseArchiveRequest = resolve;
  });
  await page.route("**/api/admin/archives", async (route) => {
    await archiveRequestPaused;
    await route.continue();
  });

  await archiveSaveButton.click();
  await expect(archiveSaveButton).toHaveText("保存中...");
  await expect(eventSaveButton).toHaveText("保存活动信息");
  releaseArchiveRequest();
  await waitForArchiveSaved(page);
  await page.unroute("**/api/admin/archives");
});

test("multi-day event lineups are grouped by date in admin, list cards, and detail pages", async ({ page }) => {
  const firstDate = getFutureDateKey(40);
  const secondDate = getFutureDateKey(41);
  await login(page);

  await page.goto("/admin/archives");
  await page.getByTestId("new-event-button").click();
  await page.locator('input[name="name"]').fill("Weekend Expo");
  await page.locator('input[name="startsAt"]').fill(firstDate);
  await page.locator('input[name="endsAt"]').fill(secondDate);
  await page.locator('input[name="city"]').fill("上海");
  await page.locator('input[name="venue"]').fill("Harbor Hall");
  await addLineupViaDialog(page, {
    talentLabel: "青鸾",
    allDates: [firstDate, secondDate],
    dateNotes: { [firstDate]: "Day 1 note" }
  });
  await addLineupViaDialog(page, {
    talentLabel: "雁锦",
    allDates: [firstDate, secondDate],
    dateNotes: { [secondDate]: "Day 2 note" }
  });
  await page.getByTestId("save-event").click();
  await openSelectedEventEditor(page);

  await addArchiveEntriesViaDialog(page, [
    { talentLabel: "青鸾", date: firstDate, cosplayTitle: "Role Day 1" },
    { talentLabel: "雁锦", date: secondDate, cosplayTitle: "Role Day 2" }
  ]);
  await page.getByTestId("archive-scene-upload-0").setInputFiles(sceneUploadPath);
  await confirmCrop(page, "archive-scene-upload-0");
  await page.getByTestId("archive-scene-upload-1").setInputFiles(sceneUploadPath);
  await confirmCrop(page, "archive-scene-upload-1");
  await page.getByTestId("archive-note").fill("Weekend Expo archive note");
  await page.getByTestId("save-archive").click();
  await waitForArchiveSaved(page);

  await page.goto("/events?eventStatus=future&q=Weekend%20Expo");
  await expect(page.getByText("Weekend Expo")).toBeVisible();
  await expect(page.getByText(getShortDateLabel(firstDate)).last()).toBeVisible();
  await expect(page.getByText(getShortDateLabel(secondDate)).last()).toBeVisible();
  await expect(page.getByText("Day 1 note")).toBeVisible();
  await expect(page.getByText("Day 2 note")).toBeVisible();

  await page.getByRole("link", { name: /Weekend Expo/ }).first().click();
  await expect(page.getByText(getShortDateLabel(firstDate)).last()).toBeVisible();
  await expect(page.getByText(getShortDateLabel(secondDate)).last()).toBeVisible();
  await expect(page.getByTestId(`archive-rail-lin-${firstDate}-viewport`)).toBeVisible();
  await expect(page.getByTestId(`archive-rail-lin-${secondDate}-viewport`)).toBeVisible();
  await expect(page.getByText("Day 1 source")).toHaveCount(0);
  await expect(page.getByText("Day 2 note")).toBeVisible();
  await expect(page.getByText("Role Day 1")).toBeVisible();
  await expect(page.getByText("Role Day 2")).toBeVisible();
});

test("talent field record cards link into the related event detail", async ({ page }) => {
  await page.goto("/talents/talent-qingluan");
  await expect(page.getByTestId("field-record-card-title-0")).toBeVisible();
  await expect(page.getByTestId("field-record-card-0").locator("img").first()).toBeVisible();
  await page.getByTestId("field-record-card-0").click();
  await expect(page).toHaveURL(/\/events\/event-mist-lantern$/);
});

test("editor can upload archive assets inline and shared-photo card toggles on the public page", async ({ page }) => {
  await login(page);

  await page.goto("/admin/archives");
  await openSelectedEventEditor(page);
  await page.getByTestId("archive-note").fill("收尾验收档案备注");
  await addArchiveEntriesViaDialog(page, [{ talentLabel: "青鸾", date: "2026-05-15", cosplayTitle: "Archive Test Role" }]);
  await page.getByTestId("archive-scene-upload-0").setInputFiles(sceneUploadPath);
  await confirmCrop(page, "archive-scene-upload-0");
  await expect(page.getByTestId("archive-scene-0")).toHaveCount(0);
  await expect(page.getByTestId("archive-scene-upload-0-clear")).toBeEnabled();
  await page.getByTestId("archive-shared-flag-0").check();
  await page.getByTestId("archive-shared-upload-0").setInputFiles(sharedUploadPath);
  await confirmCrop(page, "archive-shared-upload-0");
  await expect(page.getByTestId("archive-shared-0")).toHaveCount(0);
  await expect(page.getByTestId("archive-shared-upload-0-clear")).toBeEnabled();
  await page.getByTestId("save-archive").click();
  await waitForArchiveSaved(page);

  const publicPage = await page.context().newPage();
  await publicPage.goto("/events/event-spring-gala");
  await expect(publicPage.getByText("Archive Test Role")).toBeVisible();
  await expect(publicPage.getByText("无合照")).toHaveCount(0);

  const sharedButton = publicPage.getByTestId("archive-shared-toggle").first();
  const sharedImage = publicPage.locator('img[alt="shared-bloom"]').first();
  await expect(sharedButton).toHaveAttribute("aria-pressed", "false");
  await expect(sharedButton).toHaveAccessibleName(/查看.+的合照/);
  await expect.poll(async () => sharedImage.evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
  await sharedButton.click();
  await expect(sharedButton).toHaveAttribute("aria-pressed", "true");
  await expect(sharedButton).toHaveAccessibleName(/返回查看.+的现场图/);
  await expect.poll(async () => sharedImage.evaluate((node) => getComputedStyle(node).opacity)).toBe("1");
  await sharedButton.click();
  await expect(sharedButton).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => sharedImage.evaluate((node) => getComputedStyle(node).opacity)).toBe("0");
  await publicPage.close();
});

test("event archive rails can page horizontally within a single editor date row", async ({ page }) => {
  const firstDate = getFutureDateKey(50);
  const secondDate = getFutureDateKey(51);
  await login(page);

  await page.goto("/admin/archives");
  await page.getByTestId("new-event-button").click();
  await page.locator('input[name="name"]').fill("Rail Expo");
  await page.locator('input[name="startsAt"]').fill(firstDate);
  await page.locator('input[name="endsAt"]').fill(secondDate);
  await page.locator('input[name="city"]').fill("Shanghai");
  await page.locator('input[name="venue"]').fill("Rail Hall");

  const lineupTalentIds = ["talent-qingluan", "talent-yunmo", "talent-zhaoying", "talent-yanjin"];
  for (const talentId of lineupTalentIds) {
    await addLineupViaDialog(page, {
      talentId,
      allDates: [firstDate, secondDate],
      dateNotes: { [firstDate]: "" }
    });
  }

  await page.getByTestId("save-event").click();
  await expect(page).toHaveURL(/\/admin\/archives\?event=/);
  await openSelectedEventEditor(page);
  await page.getByTestId("import-lineup-entries").click();
  await expect(page.getByTestId("archive-entry")).toHaveCount(4);
  await page.getByTestId("archive-copy-0").click();
  await page.getByTestId("archive-copy-0").click();
  await page.getByTestId("archive-copy-0").click();
  await page.getByTestId("archive-copy-0").click();
  await expect(page.getByTestId("archive-entry")).toHaveCount(8);

  for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
    await page.getByTestId(`archive-cosplay-${index}`).fill(`Rail Role ${index + 1}`);
  }

  await page.getByTestId("save-archive").click();
  await waitForArchiveSaved(page);

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/events?eventStatus=future&q=Rail%20Expo");
  await page.getByRole("link", { name: /Rail Expo/ }).first().click();

  const viewport = page.getByTestId(`archive-rail-lin-${firstDate}-viewport`);
  const nextButton = page.getByTestId(`archive-rail-lin-${firstDate}-next`);
  const prevButton = page.getByTestId(`archive-rail-lin-${firstDate}-prev`);

  await expect(viewport).toBeVisible();
  await expect(nextButton).toBeVisible();

  const initialScrollLeft = await viewport.evaluate((node) => node.scrollLeft);
  await nextButton.click();
  await expect.poll(async () => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(initialScrollLeft);

  await prevButton.click();
  await expect.poll(async () => viewport.evaluate((node) => node.scrollLeft)).toBe(0);

  await viewport.evaluate((node) => node.scrollTo({ left: node.scrollWidth, behavior: "instant" }));
  await expect
    .poll(async () =>
      viewport.evaluate((node) =>
        Math.abs(node.scrollWidth - node.clientWidth - node.scrollLeft)
      )
    )
    .toBeLessThanOrEqual(2);
  await expect(nextButton).toBeDisabled();
});

test("inline upload surfaces clear backend error messages", async ({ page }) => {
  await login(page);

  await page.route("**/api/admin/assets", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "R2 存储配置错误：缺少 R2_PUBLIC_BASE_URL。"
      })
    });
  });

  await page.goto("/admin/talents");
  await page.getByRole("button", { name: "编辑达人" }).click();
  await page.getByTestId("talent-cover-upload").setInputFiles(sceneUploadPath);
  await confirmCrop(page, "talent-cover-upload");
  await expect(page.getByText("R2 存储配置错误：缺少 R2_PUBLIC_BASE_URL。")).toBeVisible();
});

test("talent dialogs keep focus modal and protect unsaved edits on Escape", async ({ page }) => {
  await login(page);
  await page.goto("/admin/talents");

  const opener = page.getByRole("button", { name: "编辑达人" });
  const editorDialog = page.getByRole("dialog");
  const nicknameInput = page.locator('input[name="nickname"]');

  await expect(async () => {
    if ((await editorDialog.count()) === 0) {
      await opener.click();
    }
    await expect(editorDialog).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect.poll(() => editorDialog.evaluate((node) => node.matches(":modal"))).toBe(true);
  await expect.poll(() => editorDialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect.poll(() => editorDialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  await nicknameInput.fill("青鸾未保存");
  await expect(page.getByTestId("talent-manager")).toHaveAttribute("data-unsaved", "true");
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("当前达人资料还有未保存的修改");
    await dialog.dismiss();
  });
  await page.keyboard.press("Escape");

  await expect(editorDialog).toBeVisible();
  await expect(nicknameInput).toHaveValue("青鸾未保存");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(editorDialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await opener.click();
  await expect(editorDialog).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    )
    .toBe(true);
  const mobileDialogBox = await editorDialog.boundingBox();
  expect(mobileDialogBox).not.toBeNull();
  expect(mobileDialogBox?.x).toBeGreaterThanOrEqual(0);
  expect(mobileDialogBox?.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(editorDialog).toHaveCount(0);
});

test("ladder navigation protects and preserves an unsaved draft", async ({ page }) => {
  await login(page);
  await page.goto("/admin/ladder");

  const subtitle = page.getByTestId("ladder-subtitle");
  const ladderManager = page.getByTestId("ladder-manager");
  await expect(async () => {
    await subtitle.fill("");
    await subtitle.fill("尚未保存的天梯副标题");
    await expect(ladderManager).toHaveAttribute("data-unsaved", "true", { timeout: 1000 });
  }).toPass({ timeout: 10_000 });

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("当前天梯榜还有未保存的修改");
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "总览" }).click();
  await expect(page).toHaveURL(/\/admin\/ladder$/);
  await expect(subtitle).toHaveValue("尚未保存的天梯副标题");

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/admin\/ladder$/);
  await expect(subtitle).toHaveValue("尚未保存的天梯副标题");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "总览" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("editor can clear a current image and save the empty state", async ({ page }) => {
  await login(page);

  await page.goto("/admin/talents");
  await page.getByRole("button", { name: "编辑达人" }).click();
  await expect(page.getByTestId("talent-cover-upload-clear")).toBeEnabled();
  await page.getByTestId("talent-cover-upload-clear").click();
  await expect(page.getByTestId("talent-cover-upload-clear")).toBeDisabled();
  await page.getByTestId("save-talent").click();
  await expect(page.getByText(/已保存达人/)).toBeVisible();
  await page.getByRole("button", { name: "编辑达人" }).click();
  await expect(page.getByText("当前未上传图片")).toBeVisible();
});

test("editor can reopen crop for an existing image", async ({ page }) => {
  await login(page);

  await page.goto("/admin/talents");
  await page.getByRole("button", { name: "编辑达人" }).click();
  await expect(page.getByTestId("talent-cover-upload-edit")).toBeVisible();
  await page.getByTestId("talent-cover-upload-edit").click();
  await expect(page.getByTestId("talent-cover-upload-crop-frame")).toBeVisible();
  await expect(page.getByTestId("talent-cover-upload-crop-zoom")).toBeVisible();
});

test("public filters apply automatically without a filter button", async ({ page }) => {
  await page.goto("/talents");
  await page.getByLabel("按 MCN 筛选达人").selectOption("浮光社");
  await expect(page).toHaveURL(/mcn=/);
  await expect(page.getByText("雁锦")).toBeVisible();

  await page.goto("/events");
  await page.getByLabel("按状态筛选活动").selectOption("past");
  await expect(page).toHaveURL(/eventStatus=past/);
});

test("horizontal rail disables both controls when all cards already fit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/talents/talent-qingluan");

  await expect(page.getByTestId("representation-rail-prev")).toBeDisabled();
  await expect(page.getByTestId("representation-rail-next")).toBeDisabled();
});

test("editor can update ladder subtitle while the derived title stays public", async ({ page }) => {
  await login(page);

  await page.goto("/admin/ladder");
  await expect(page.getByTestId("ladder-title")).toHaveValue("凛的天梯榜");
  await page.getByTestId("ladder-subtitle").fill("CI subtitle from smoke");
  await page.getByTestId("save-ladder").click();
  await expect(page.getByText("天梯榜已保存。")).toBeVisible();
  await expect(page.getByTestId("ladder-title")).toHaveValue("凛的天梯榜");

  await page.goto("/ladder?editor=lin");
  await expect(page.getByRole("heading", { name: "凛的天梯榜" })).toBeVisible();
  await expect(page.getByText("CI subtitle from smoke")).toBeVisible();
});

test("editor can rename their display name and see it reflected publicly", async ({ page }) => {
  await login(page);

  await page.goto("/admin");
  await page.getByTestId("editor-name-input").fill("凛编辑");
  const saveEditorResponse = page.waitForResponse(
    (response) => response.url().includes("/api/admin/editor") && response.request().method() === "PUT"
  );
  await page.getByTestId("save-editor-name").click();
  await expect((await saveEditorResponse).ok()).toBe(true);
  await expect(page.getByText("昵称已更新，后台顶部和公开页面会同步刷新。")).toBeVisible({ timeout: 10_000 });

  await expect(page.getByTestId("editor-name-input")).toHaveValue("凛编辑");

  await page.goto("/");
  await expect(page.getByText("凛编辑")).toBeVisible();

  await page.goto("/ladder?editor=lin");
  await expect(page.getByRole("heading", { name: "凛编辑的天梯榜" })).toBeVisible();
});

test("representation order syncs from admin sorting to the public talent detail", async ({ page }) => {
  await login(page);

  await page.goto("/admin/talents");
  await page.getByRole("button", { name: "编辑达人" }).click();
  await page.getByTestId("representation-title-0").fill("Representation Alpha");
  await page.getByTestId("representation-title-1").fill("Representation Beta");
  await dragByTestId(page, "representation-handle-1", "representation-drop-0");
  await expect(page.getByTestId("representation-title-0")).toHaveValue("Representation Beta");
  await expect(page.getByTestId("representation-title-1")).toHaveValue("Representation Alpha");
  const saveTalentResponse = page.waitForResponse(
    (response) => response.url().includes("/api/admin/talents/") && response.request().method() === "PUT"
  );
  await page.getByTestId("save-talent").click();
  await saveTalentResponse;

  await page.goto("/talents/talent-qingluan");
  await expect(page.getByTestId("representation-card-title-0")).toHaveText("Representation Beta");
  await expect(page.getByTestId("representation-card-title-1")).toHaveText("Representation Alpha");
});

test("ladder tier ordering syncs from admin sorting to the public ladder", async ({ page }) => {
  await login(page);

  await page.goto("/admin/ladder");
  await page.getByTestId("tier-lin-t1-talent-1").dragTo(page.getByTestId("tier-lin-t1-talent-0"));
  await page.getByTestId("save-ladder").click();
  await expect(page.getByText("天梯榜已保存。")).toBeVisible();

  await expect(page.getByTestId("tier-lin-t1-talent-0")).toContainText("昭映");
  await expect(page.getByTestId("tier-lin-t1-talent-1")).toContainText("云墨");

  await page.goto("/ladder?editor=lin");
  await expect(page.getByTestId("ladder-tier-lin-t1-talent-0")).toContainText("昭映");
  await expect(page.getByTestId("ladder-tier-lin-t1-talent-1")).toContainText("云墨");
});

test("dragging ladder chips to delete returns them to the sorted unranked pool", async ({ page }) => {
  await login(page);

  await page.goto("/admin/ladder");
  await page.getByTestId("tier-lin-t0-talent-0").dragTo(page.getByTestId("tier-lin-t0-delete"));
  await page.getByTestId("tier-lin-t1-talent-0").dragTo(page.getByTestId("tier-lin-t1-delete"));

  const poolTalents = page.locator('[data-testid^="unassigned-talent-"]');
  await expect(poolTalents).toHaveCount(2);
  await expect(poolTalents.nth(0)).toHaveText("青鸾");
  await expect(poolTalents.nth(1)).toHaveText("云墨");
  await expect(page.getByTestId("tier-lin-t0-talent-0")).toHaveCount(0);
});

test("double-clicking a ladder chip returns it to the unranked pool", async ({ page }) => {
  await login(page);

  await page.goto("/admin/ladder");
  await page.getByTestId("tier-lin-t0-talent-0").dblclick();

  const poolTalents = page.locator('[data-testid^="unassigned-talent-"]');
  await expect(poolTalents).toHaveCount(1);
  await expect(poolTalents.first()).toHaveText("青鸾");
  await expect(page.getByTestId("tier-lin-t0-talent-0")).toHaveCount(0);

  await page.getByTestId("save-ladder").click();
  await expect(page.getByText("天梯榜已保存。")).toBeVisible();

  await page.goto("/ladder?editor=lin");
  await expect(page.getByTestId("ladder-tier-lin-t0-talent-0")).toHaveCount(0);
});

test("event index can filter by editor archive presence", async ({ page }) => {
  await page.goto("/events");
  await page.locator('select[name="editor"]').selectOption("lin");
  await expect(page).toHaveURL(/editor=lin/);
  await expect(page.getByText("雾灯国风夜")).toBeVisible();
  await expect(page.getByText("春序漫展 2026")).toHaveCount(0);
});

test("admin return button routes back to the matching public section", async ({ page }) => {
  await login(page);

  await page.goto("/admin/archives");
  await page.getByTestId("return-to-site").click();
  await expect(page).toHaveURL(/\/events$/);

  await page.goto("/admin/talents");
  await page.getByTestId("return-to-site").click();
  await expect(page).toHaveURL(/\/talents$/);

  await page.goto("/admin/ladder");
  await page.getByTestId("return-to-site").click();
  await expect(page).toHaveURL(/\/ladder$/);
});

test("archive workspace can import lineup entries and duplicate a record", async ({ page }) => {
  await login(page);

  await page.goto("/admin/archives");
  await openSelectedEventEditor(page);
  await page.getByTestId("import-lineup-entries").click();
  await expect(page.getByTestId("archive-entry")).toHaveCount(2);

  await page.getByTestId("archive-copy-1").click();
  await expect(page.getByTestId("archive-entry")).toHaveCount(3);

  await page.getByTestId("archive-note").fill("Imported archive workflow note");
  await page.getByTestId("archive-cosplay-0").fill("Role One");
  await page.getByTestId("archive-cosplay-1").fill("Role Two");
  await page.getByTestId("archive-scene-upload-0").setInputFiles(sceneUploadPath);
  await confirmCrop(page, "archive-scene-upload-0");
  await page.getByTestId("archive-scene-upload-1").setInputFiles(sceneUploadPath);
  await confirmCrop(page, "archive-scene-upload-1");
  await page.getByTestId("archive-scene-upload-2").setInputFiles(sceneUploadPath);
  await confirmCrop(page, "archive-scene-upload-2");
  await page.getByTestId("save-archive").click();

  await expect(page.getByTestId("archive-entry")).toHaveCount(3);
  await expect(page.getByTestId("archive-note")).toHaveValue("Imported archive workflow note");
});

test("public pages remain browsable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TIANTI" })).toBeVisible();
  await expect(page.getByTestId("site-header")).toHaveCSS("position", "static");

  await page.goto("/talents");
  await expect(page.getByTestId("talents-page-title")).toBeVisible();

  await page.goto("/events");
  await expect(page.getByTestId("events-page-title")).toBeVisible();
  await expectGridColumnCount(page.getByTestId("event-card-lineup-grid").first(), 3);

  await page.goto("/events/event-spring-gala");
  await expectGridColumnCount(page.getByTestId("event-detail-lineup-grid").first(), 2);

  await page.goto("/ladder");
  await expect(page.getByTestId("ladder-page-title")).toBeVisible();
});

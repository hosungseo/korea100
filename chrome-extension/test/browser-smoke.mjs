import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const outputDir = path.join(root, "test-results");
const chromePath = process.env.CHROME_PATH || chromium.executablePath();
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "korea100-extension-"));

await mkdir(outputDir, { recursive: true });
const context = await chromium.launchPersistentContext(userDataDir, {
  executablePath: chromePath,
  // Chrome disables unpacked extensions in its headless test profile.
  headless: false,
  acceptDownloads: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  viewport: { width: 420, height: 900 }
});

try {
  let [serviceWorker] = context.serviceWorkers();
  serviceWorker ||= await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 420, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.getByRole("tab", { name: "찾기" }).click();
  await page.getByRole("searchbox", { name: "제도 검색" }).fill("직장 내 괴롭힘");
  await page.getByText("직장 내 괴롭힘 처리절차", { exact: true }).first().waitFor();
  assert.equal(await page.locator("#result-limit-notice").isHidden(), true);
  await page.screenshot({ path: path.join(outputDir, "search-420.png"), fullPage: true });

  const resultRow = page.locator(".list-row").filter({ hasText: "직장 내 괴롭힘 처리절차" }).first();
  await resultRow.getByRole("button", { name: "복제" }).click();
  await page.getByRole("heading", { name: "직장 내 괴롭힘 처리절차" }).waitFor();
  await page.locator(".node-row").first().waitFor();
  assert.ok((await page.locator(".node-row").count()) >= 10);
  await page.locator(".node-row").first().locator('[data-action="open-step"]').click();
  assert.equal(await page.locator("#node-type").inputValue(), "gateway");
  await page.getByRole("button", { name: "닫기" }).click();
  await page.locator('.draft-subtabs [data-section="edges"]').click();
  assert.equal(await page.locator(".connection-row").count(), 29);
  await page.locator('.draft-subtabs [data-section="steps"]').click();
  await page.waitForTimeout(2_900);
  await page.screenshot({ path: path.join(outputDir, "draft-420.png"), fullPage: true });

  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator('.draft-subtabs [data-section="overview"]').click();
  const originalSummary = await page.locator("#draft-summary").inputValue();
  await page.locator("#draft-summary").fill(`${originalSummary} 저장 검사`);
  await page.locator('.draft-toolbar [data-action="save-overview"]').click();
  await page.getByText("초안을 저장했습니다.").waitFor();

  await page.locator("#draft-summary").fill("person@example.com");
  await page.locator('.draft-toolbar [data-action="save-overview"]').click();
  await page.getByText("저장할 수 없는 항목").waitFor();
  assert.match(await page.locator("#draft-problems").textContent(), /이메일 주소/);
  await page.locator("#draft-summary").fill(originalSummary);
  await page.locator('.draft-toolbar [data-action="save-overview"]').click();

  const draftDownloadPromise = page.waitForEvent("download");
  await page.locator('.draft-toolbar [data-action="export-draft"]').click();
  const draftDownload = await draftDownloadPromise;
  const draftPayload = JSON.parse(await readFile(await draftDownload.path(), "utf8"));
  assert.equal(draftPayload.kind, "korea100.personal-draft");

  const contributionDownloadPromise = page.waitForEvent("download");
  await page.locator('.draft-toolbar [data-action="export-contribution"]').click();
  await page.getByRole("button", { name: "GitHub용 저장" }).click();
  const contributionDownload = await contributionDownloadPromise;
  const contributionPayload = JSON.parse(await readFile(await contributionDownload.path(), "utf8"));
  assert.equal(contributionPayload.kind, "korea100.contribution");
  assert.equal(contributionPayload.submission.platform, "github");
  assert.equal(contributionPayload.privacy.excerptIncluded, false);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `320px 화면에서 ${overflow}px 가로 넘침이 발생했습니다.`);
  await page.screenshot({ path: path.join(outputDir, "overview-320.png"), fullPage: true });

  await page.getByTitle("작업대 설정").click();
  await page.getByRole("heading", { name: "작업대 설정" }).waitFor();
  const dialogOverflow = await page.locator("#modal").evaluate((element) => element.scrollWidth - element.clientWidth);
  assert.ok(dialogOverflow <= 1, `설정 모달에서 ${dialogOverflow}px 가로 넘침이 발생했습니다.`);
  await page.screenshot({ path: path.join(outputDir, "settings-320.png"), fullPage: true });

  console.log(`Chrome 스모크 테스트 완료: ${extensionId}`);
} finally {
  await context.close();
  await rm(userDataDir, { recursive: true, force: true });
}

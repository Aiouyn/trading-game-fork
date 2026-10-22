import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { boot } from "./helpers";

// Recent on the shared T5 <Sheet>: same content, Sheet spec chrome (radius 20, handle, --elev-sheet, focus trap).
const SHOTS = "tests/e2e/shell/__screenshots__/17a/recent-sheet";
async function shot(page: Page, name: string) {
  const vp = page.viewportSize()!;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}x${vp.height}.png` });
}
/** Two apps, so Recent is not empty. */
async function seed(page: Page) {
  for (const a of ["wire", "portfolio"]) { await page.getByTestId(`icon-${a}`).click(); await page.getByTestId("app-back").click(); }
}

/** Record every click the page sees, with the test id of its target and whether it was trusted. */
async function recordClicks(page: Page) {
  await page.evaluate(() => {
    const w = window as Window & { __clicks?: { tid: string | null; trusted: boolean }[] };
    w.__clicks = [];
    document.addEventListener("click", (e) => {
      const t = e.target as HTMLElement | null;
      w.__clicks!.push({ tid: t?.dataset?.testid ?? null, trusted: e.isTrusted });
    }, true);
  });
}

/**
 * A real finger on the Quay mark: CDP Input.dispatchTouchEvent, so the browser generates TRUSTED pointer,
 * mouse and click events, exactly like a tap. A synthetic dispatchEvent does not, and it is precisely the
 * release click a finger produces that used to dismiss the sheet the finger had just opened.
 * Returns with the finger STILL DOWN and the sheet open (the long-press timer fired while the finger rested).
 */
async function fingerDown(page: Page) {
  const b = (await page.getByTestId("quay-mark").boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const at = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...at, id: 1 }] });
  // The sheet opens on the 400 ms long-press, under the finger that is still resting on the mark.
  await expect(page.getByTestId("recent")).toBeVisible();
  return { cdp, at };
}

/** Open Recent the way a finger does: press, hold past the long-press, release. */
async function openRecent(page: Page) {
  const { cdp } = await fingerDown(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await expect(page.getByTestId("recent")).toBeVisible();
}

/** A real press that STARTS on the scrim: the gesture that dismisses the sheet. */
async function pressScrim(page: Page) {
  const b = (await page.getByTestId("recent-scrim").boundingBox())!;
  await page.mouse.move(b.x + 20, b.y + 20);
  await page.mouse.down();
  await page.mouse.up();
}

test("Recent: a real touch opens it, the sheet survives the finger that opened it, and focus returns to the Quay mark", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Recent is the phone long-press sheet");
  await boot(page, "/");
  await seed(page);
  // A finger does not focus the button it presses: nothing is focused, which is the production path.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");
  await recordClicks(page);

  const { cdp } = await fingerDown(page);
  await expect(page.getByTestId("recent")).toBeVisible(); // open while the finger is still down
  // The release produces a TRUSTED click at the release coordinates, which land on the scrim the sheet has
  // just created. That click must NOT dismiss the sheet, or a touch user can never reach Recent.
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await expect.poll(() => page.evaluate(() => (window as Window & { __clicks?: unknown[] }).__clicks?.length ?? 0)).toBeGreaterThan(0);
  const clicks = await page.evaluate(() => (window as Window & { __clicks?: { tid: string | null; trusted: boolean }[] }).__clicks ?? []);
  // The hazard is really exercised: a trusted click landed on the scrim...
  expect(clicks.some((c) => c.trusted && c.tid === "recent-scrim")).toBe(true);
  // ...and the sheet is still open, because the scrim dismisses on pointerdown, never on click.
  await expect(page.getByTestId("recent")).toBeVisible();

  // Esc closes it. The sheet is asserted open immediately before the keypress, so the assertion cannot be
  // satisfied by a close that had already happened.
  expect(await page.getByTestId("recent").count()).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("recent")).toHaveCount(0);
  // Focus returns to the Quay mark, the opener — even though the finger never focused it.
  await expect(page.getByTestId("quay-mark")).toBeFocused();
});

test("The shared Sheet closes on its own Escape (this page mounts no shell key map)", async ({ page }) => {
  // /__ds mounts the Sheet WITHOUT src/shell/keys.ts (the shell's second, independent global Escape
  // handler), so the only thing that can close this sheet here is the Sheet's own Escape branch.
  await page.goto("/__ds/notices?show=sheet-bottom");
  const sheet = page.getByTestId("sheet");
  await expect(sheet).toBeVisible();
  expect(await sheet.count()).toBe(1);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("Recent sheet: Sheet chrome, focus trap, Esc returns focus, scrim closes, items open apps", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Recent is the phone long-press sheet");
  await boot(page, "/");
  await seed(page);
  await openRecent(page);
  const r = page.getByTestId("recent");
  await expect(r).toHaveAttribute("role", "dialog");
  await expect(r).toHaveAttribute("aria-modal", "true");
  await expect(r).toHaveAccessibleName("Recent");
  await expect(r).toHaveClass(/qs-bottom/);
  await expect(r.locator(".qs-handle")).toHaveCount(1);
  // The grab handle: 36×4 (17 §3.3.3).
  const handle = (await r.locator(".qs-handle").boundingBox())!;
  expect([Math.round(handle.width), Math.round(handle.height)]).toEqual([36, 4]);
  // The visible heading, not only the accessible name the Sheet supplies.
  await expect(r.locator("h2")).toHaveText("Recent");
  const css = await r.evaluate((e) => { const c = getComputedStyle(e); const p = document.createElement("i"); p.style.boxShadow = "var(--elev-sheet)"; document.body.append(p); const want = getComputedStyle(p).boxShadow; p.remove(); return { tl: c.borderTopLeftRadius, tr: c.borderTopRightRadius, sh: c.boxShadow, want, bf: c.backdropFilter }; });
  expect([css.tl, css.tr, css.sh === css.want, css.bf]).toEqual(["20px", "20px", true, "none"]);
  // [P] no backdrop-filter, ever — asserted in the DEFAULT state. Under data-transparency="reduce" the rule
  // html[data-transparency="reduce"] * { backdrop-filter: none !important } masks the shipped rule, so the
  // reduced-transparency assertion alone leaves the default state unprotected.
  expect(await page.getByTestId("recent-scrim").evaluate((e) => getComputedStyle(e).backdropFilter)).toBe("none");
  // The list: no markers, its own spacing.
  const list = await r.locator(".recent-list").evaluate((e) => { const c = getComputedStyle(e); return { ls: c.listStyleType, mt: c.marginTop }; });
  expect([list.ls, list.mt]).toEqual(["none", "8px"]);
  const n = await page.getByTestId("recent-item").count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(6);
  for (const it of await page.getByTestId("recent-item").all()) expect((await it.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (let i = 0; i < n + 2; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=recent]"))).toBe(true);
  }
  await page.waitForTimeout(300);
  await shot(page, "recent-sheet");
  const ax = await new AxeBuilder({ page }).analyze();
  expect(ax.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  // Esc: the sheet is open immediately before the keypress and gone immediately after.
  expect(await r.count()).toBe(1);
  await page.keyboard.press("Escape");
  await expect(r).toHaveCount(0);
  await expect(page.getByTestId("quay-mark")).toBeFocused();
  await openRecent(page);
  // The scrim closes the sheet: a press that STARTS on the scrim dismisses it.
  await pressScrim(page);
  await expect(r).toHaveCount(0);
  await openRecent(page);
  await page.getByTestId("recent-item").first().click();
  await expect(page.getByTestId("phone-appview")).toBeVisible();
});

test("Recent sheet under reduced motion + transparency: no animation, no backdrop-filter", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone only");
  await boot(page, "/");
  await page.evaluate(() => { document.documentElement.dataset.motion = "reduce"; document.documentElement.dataset.transparency = "reduce"; });
  await seed(page);
  await openRecent(page);
  // The reduced-motion rule really removes the sheet's entry animation, not just its duration (the
  // duration is already 0 ms because tokens.css sets --dur-base: 0 ms under data-motion="reduce").
  expect(await page.getByTestId("recent").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  const v = await page.getByTestId("recent-layer").evaluate((l: HTMLElement) => [l, ...l.querySelectorAll<HTMLElement>("*")].filter((e) => {
    const c = getComputedStyle(e); return parseFloat(c.animationDuration) > 0 || parseFloat(c.transitionDuration) > 0 || (c.backdropFilter && c.backdropFilter !== "none");
  }).length);
  expect(v).toBe(0);
});

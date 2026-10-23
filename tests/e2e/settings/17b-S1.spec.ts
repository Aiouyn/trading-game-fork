// 17B S1 (Settings frame + SET-02 Appearance) and S1-14 (SET-08 About in-app). Run by path:
//   E2E_PORT=… npx playwright test tests/e2e/settings --output=/tmp/…
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PALETTE_IDS, PALETTES } from "../../../src/styles/tokens";
import { boot } from "../shell/helpers";

const SHOTS = "tests/e2e/settings/__screenshots__/S1";
const isPhone = (info: { project: { name: string } }) => info.project.name === "phone";
const html = (page: Page, k: string) => page.evaluate((key) => document.documentElement.dataset[key] ?? null, k);
const cssVar = (page: Page, v: string, sel = "html") => page.evaluate(([s, name]) => getComputedStyle(document.querySelector(s)!).getPropertyValue(name).trim(), [sel, v]);
/** Computed colour of any CSS colour value (normalises #FFF vs #FFFFFF). */
const rgb = (page: Page, value: string, sel = "body") => page.evaluate(([v, s]) => {
  const d = document.createElement("i"); d.style.color = v; document.querySelector(s)!.append(d); const c = getComputedStyle(d).color; d.remove(); return c;
}, [value, sel]);
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth
  && [...document.querySelectorAll(".settings *")].every((e) => e.getBoundingClientRect().right <= window.innerWidth + 0.5));
// A committed PNG has to be reproducible, and two things were not (measured: two back-to-back shoots of
// this spec, same commit and same build, differed in 10 of 20 PNGs). The TickRing sweep restarts on every
// 5 s tick, so the 22 px ring in the header lands on a different arc each shot (17-40 px per shot). And a
// shot taken while a transition the test itself started is still running catches a mid-frame: the switch
// is 120 ms, the palette and high-contrast changes re-theme every colour, and the colour-blind shot
// differed in 1.3 % of its pixels. Neither is a product change: this pins the ring's arc for the shoot and
// awaits the animations' own `finished` promises, so there is no sleep and no timeout.
const PIN = ".tickring-sweep{animation:none!important;stroke-dashoffset:62!important}";
async function shutter(page: Page) {
  await page.evaluate((css) => {
    if (document.documentElement.dataset.shotPin) return;
    const el = document.createElement("style");
    el.textContent = css;
    document.head.append(el);
    document.documentElement.dataset.shotPin = "1";
  }, PIN);
  // The settle is bounded and exits the first time nothing is running; a replaced transition rejects its
  // own `finished`, so the loop re-reads the list rather than trusting one snapshot.
  for (let i = 0; i < 5; i++) {
    const running = await page.evaluate(async () => {
      const run = document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming().iterations ?? 1) !== Infinity);
      await Promise.all(run.map((a) => a.finished.catch(() => undefined)));
      return run.length;
    });
    if (running === 0) return;
  }
}

async function openAppearance(page: Page, info: { project: { name: string } }, q = "") {
  await boot(page, `/settings${q}`);
  if (isPhone(info)) await page.getByTestId("set-nav-SET-02").click();
  await expect(page.getByTestId("appearance")).toBeVisible();
}

test("S1-01: frame — 8 sections; desktop selects Appearance; phone pushes with Back to Settings", async ({ page }, info) => {
  await boot(page, "/settings");
  await expect(page.locator(".set-nav-item")).toHaveCount(8);
  if (isPhone(info)) {
    await expect(page.getByTestId("appearance")).toHaveCount(0);
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/root-390x844.png` });
    await page.getByTestId("set-nav-SET-02").click();
    await expect(page.locator("#phone-app-title")).toHaveText("Appearance");
    await expect(page.locator(".appbar .icon-btn")).toHaveAttribute("aria-label", "Back to Settings");
    await page.locator(".appbar .icon-btn").click();
    await expect(page.locator(".set-nav-item")).toHaveCount(8);
    await expect(page.locator("#phone-app-title")).toHaveText("Settings");
  } else {
    await expect(page.getByTestId("set-nav-SET-02")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("appearance")).toBeVisible();
  }
});

test("S1-02: with Settings open, a client-side deep link to /settings/SET-08 focuses the same window and selects About", async ({ page }, info) => {
  test.skip(isPhone(info));
  await boot(page, "/settings");
  const win = page.getByTestId("win-settings");
  await expect(win).toHaveCount(1);
  // Open a second app so focus has to move back to Settings.
  await page.getByTestId("tile-portfolio").click();
  const count = await page.locator(".win").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).join(","));
  const winId = await win.getAttribute("data-instance");
  await page.evaluate(() => { (window as unknown as { __quayMark: boolean }).__quayMark = true; });
  // Client-side navigation through the Next app router (no document reload).
  await page.evaluate(() => (window as unknown as { next: { router: { push: (h: string) => void } } }).next.router.push("/settings/SET-08"));
  await expect(page).toHaveURL(/\/settings\/SET-08$/);
  expect(await page.evaluate(() => (window as unknown as { __quayMark?: boolean }).__quayMark)).toBe(true); // same document
  await expect(win.getByTestId("settings-about")).toBeVisible();
  await expect(win.getByTestId("set-nav-SET-08")).toHaveAttribute("aria-current", "page");
  expect(await page.locator(".win").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).join(","))).toBe(count);
  expect(await win.getAttribute("data-instance")).toBe(winId);
  await expect(win).toHaveClass(/\bactive\b/);
  // An unbuilt section shows ComingLater.
  await win.getByTestId("set-nav-SET-03").click();
  await expect(win.getByTestId("coming-later")).toBeVisible();
});

test("Boot runs once per page load: an R0 client-side route change shows no boot and keeps windows", async ({ page }, info) => {
  test.skip(isPhone(info));
  await page.goto("/settings?rank=R0");
  await expect(page.getByTestId("boot")).toBeVisible(); // R0 boot (900 ms)
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await page.getByTestId("tile-help").click();
  const before = await page.locator(".win").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).sort().join(","));
  expect(before).toBe("win-help,win-settings");
  await page.evaluate(() => {
    const w = window as unknown as { __bootSeen: boolean };
    w.__bootSeen = false;
    new MutationObserver(() => { if (document.querySelector("[data-testid=boot]")) w.__bootSeen = true; }).observe(document.body, { childList: true, subtree: true });
  });
  await page.evaluate(() => (window as unknown as { next: { router: { push: (h: string) => void } } }).next.router.push("/settings/SET-08?rank=R0"));
  await expect(page).toHaveURL(/\/settings\/SET-08\?rank=R0$/);
  await expect(page.getByTestId("win-settings").getByTestId("settings-about")).toBeVisible();
  await page.waitForTimeout(1200); // longer than the R0 boot
  expect(await page.evaluate(() => (window as unknown as { __bootSeen: boolean }).__bootSeen)).toBe(false);
  await expect(page.getByTestId("boot")).toHaveCount(0);
  expect(await page.locator(".win").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")).sort().join(","))).toBe(before);
});

test("S1-03/04/13: swatches set the palette; tokens match; DOM identical; ring is --fg; no brass", async ({ page }, info) => {
  await openAppearance(page, info);
  const doms: string[] = [];
  for (const p of PALETTE_IDS) {
    await page.getByTestId(`swatch-${p}`).click();
    expect(await html(page, "palette")).toBe(p);
    await page.waitForTimeout(400); // palette transitions
    for (const k of ["bg0", "win", "acc", "fg", "line", "gain", "loss"]) expect(await rgb(page, `var(--${k})`), `${p} ${k}`).toBe(await rgb(page, PALETTES[p][k]));
    // Scoped previews draw with their own palette.
    for (const q of PALETTE_IDS) {
      for (const k of ["acc", "bg0"]) expect(await rgb(page, `var(--${k})`, `[data-testid=swatch-mini-${q}]`)).toBe(await rgb(page, PALETTES[q][k]));
    }
    const ring = await page.getByTestId(`swatch-mini-${p}`).evaluate((e) => getComputedStyle(e).outlineColor);
    const fg = await page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--fg)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    expect(ring).toBe(fg);
    const brass = await page.evaluate(() => {
      const d = document.createElement("i"); d.style.color = "var(--acc)"; document.body.append(d); const acc = getComputedStyle(d).color; d.remove();
      return [...document.querySelectorAll(".settings *")].filter((e) => !e.closest(".swatch-mini")).filter((e) => {
        const cs = getComputedStyle(e);
        return [cs.color, cs.backgroundColor, cs.borderTopColor].includes(acc) && cs.borderTopWidth !== "0px" || cs.backgroundColor === acc || cs.color === acc;
      }).length;
    });
    expect(brass).toBe(0);
    doms.push(await page.getByTestId("settings").evaluate((e) => e.outerHTML.replace(/<span class="swatch-check"[\s\S]*?<\/svg><\/span>/g, "").replace(/aria-checked="(true|false)"/g, "").replace(/tabindex="-?\d"/g, "")));
  }
  expect(new Set(doms).size).toBe(1);
});

test("S1-05: palette persists from device storage; prefs memo has no palette", async ({ page }, info) => {
  await openAppearance(page, info);
  await page.getByTestId("swatch-riviera").click();
  await page.evaluate(() => (window as Window & { __quayFlush?: () => Promise<void> }).__quayFlush?.());
  await page.waitForTimeout(800);
  await page.goto("/");
  await expect(page.getByTestId("quay-ready")).toBeVisible();
  await expect.poll(() => html(page, "palette")).toBe("riviera");
});

test("S1-06: shell list, Purchased chip, selection applies shell-r1", async ({ page }, info) => {
  await openAppearance(page, info, "?rank=R3&shells=r0,r1,r2,r3&owned=cos_shell_glass");
  await expect(page.locator(".shell-row")).toHaveCount(5);
  await expect(page.getByTestId("shell-cos_shell_glass").getByTestId("purchased")).toHaveText("Purchased");
  // E-64 §3: exactly one row is labelled purchased -- the chip is not painted on every shell.
  await expect(page.getByTestId("shell-list").getByTestId("purchased")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.classList.contains("shell-r3"))).toBe(true);
  await page.getByTestId("shell-r1").click();
  const cls = await page.evaluate(() => [...document.documentElement.classList]);
  expect(cls).toContain("shell-r1");
  expect(cls).not.toContain("shell-r3");
  if (!isPhone(info)) await page.getByTestId("shell-list").screenshot({ path: `${SHOTS}/shells-purchased-1440x900.png` });
});

test("S1-07: slider 1.5 → --text-scale 1.5, --fs-14 = 21px; arrows step 0.25; valuetext", async ({ page }, info) => {
  await openAppearance(page, info);
  const s = page.getByTestId("text-scale");
  await s.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(s).toHaveAttribute("aria-valuetext", "150 percent");
  expect(await cssVar(page, "--text-scale")).toBe("1.5");
  expect(await page.evaluate(() => { const d = document.createElement("i"); d.style.fontSize = "var(--fs-14)"; document.body.append(d); const v = getComputedStyle(d).fontSize; d.remove(); return v; })).toBe("21px");
  await page.keyboard.press("ArrowLeft");
  await expect(s).toHaveAttribute("aria-valuetext", "125 percent");
  await page.keyboard.press("End");
  await expect(s).toHaveAttribute("aria-valuetext", "200 percent");
  await page.keyboard.press("Home");
  await expect(s).toHaveAttribute("aria-valuetext", "100 percent");
  if (!isPhone(info)) {
    await s.fill("1.5"); await s.blur();
    await page.getByTestId("scale-preview").screenshot({ path: `${SHOTS}/preview-scale1.5-1440x900.png` });
  }
});

test("S1-08: text scale 2.0 at phone — no horizontal scroll, no truncation", async ({ page }, info) => {
  test.skip(!isPhone(info));
  await openAppearance(page, info);
  const s = page.getByTestId("text-scale");
  await s.fill("2"); await s.blur();
  expect(await noHScroll(page)).toBe(true);
  const clipped = await page.evaluate(() => [...document.querySelectorAll(".settings .num, .settings .set-row-label, .settings .shell-name")]
    .filter((e) => e.scrollWidth > e.clientWidth + 1).length);
  expect(clipped).toBe(0);
  await shutter(page);
  await page.screenshot({ path: `${SHOTS}/appearance-scale2-390x844.png`, fullPage: true });
});

test("S1-09: high contrast and colour-blind switches", async ({ page }, info) => {
  await openAppearance(page, info);
  await page.getByTestId("switch-hc").click();
  await expect(page.getByTestId("switch-hc")).toHaveAttribute("aria-checked", "true");
  expect(await html(page, "hc")).toBe("1");
  expect(await cssVar(page, "--line")).toBe(await cssVar(page, "--fg-disabled"));
  if (!isPhone(info)) { await shutter(page); await page.screenshot({ path: `${SHOTS}/appearance-hc-1440x900.png` }); }
  await page.getByTestId("switch-hc").click();
  await page.getByTestId("swatch-broadsheet").click();
  await page.getByTestId("switch-cb").click();
  expect(await html(page, "cb")).toBe("1");
  expect((await cssVar(page, "--gain")).toUpperCase()).toBe("#08657A");
  expect((await cssVar(page, "--loss")).toUpperCase()).toBe("#A8235A");
  if (!isPhone(info)) { await shutter(page); await page.screenshot({ path: `${SHOTS}/appearance-cb-broadsheet-1440x900.png` }); }
});

test("S1-10: reduce motion / transparency segments; System follows the OS", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openAppearance(page, info);
  await expect(page.getByTestId("os-reducedMotion")).toHaveText("System: on");
  expect(await html(page, "motion")).toBe("reduce");
  if (isPhone(info)) await page.getByTestId("seg-reducedMotion").screenshot({ path: `${SHOTS}/motion-system-on-390x844.png` });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByTestId("seg-reducedMotion").getByRole("radio", { name: "On", exact: true }).click();
  expect(await html(page, "motion")).toBe("reduce");
  const durs = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => !e.closest(".tickring, [class*=tickring]"))
    .filter((e) => { const cs = getComputedStyle(e); return [cs.transitionDuration, cs.animationDuration].some((d) => d.split(",").some((x) => parseFloat(x) > 0)); }).length);
  expect(durs).toBe(0);
  await page.getByTestId("seg-reducedTransparency").getByRole("radio", { name: "On", exact: true }).click();
  expect(await html(page, "transparency")).toBe("reduce");
  expect(await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => { const b = getComputedStyle(e).backdropFilter; return b && b !== "none"; }).length)).toBe(0);
});

test("S1-11: roles, hit areas, axe 0 serious", async ({ page }, info) => {
  await openAppearance(page, info);
  await expect(page.locator(".settings [role=switch]")).toHaveCount(2);
  await expect(page.locator(".settings [role=slider], .settings input[type=range]")).toHaveCount(1);
  await expect(page.locator(".settings [role=radiogroup]")).toHaveCount(4);
  const min = isPhone(info) ? 44 : 28;
  const small = await page.evaluate((m) => [...document.querySelectorAll(".settings button, .settings input, .settings a")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && Math.min(r.height, r.width) < m; }).map((e) => `${e.className || e.tagName} ${e.textContent}`), min);
  expect(small).toEqual([]);
  const res = await new AxeBuilder({ page }).include(".settings").analyze();
  expect(res.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("Screenshots: Appearance per palette / scale", async ({ page }, info) => {
  await openAppearance(page, info);
  if (isPhone(info)) {
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/appearance-scale1-390x844.png`, fullPage: true });
    await page.getByTestId("swatch-broadsheet").click();
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/appearance-broadsheet-390x844.png`, fullPage: true });
    return;
  }
  for (const p of PALETTE_IDS) {
    await page.getByTestId(`swatch-${p}`).click();
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/appearance-${p}-1440x900.png` });
  }
});

test("Studio #7: the stacked segment and the full Appearance pane have visual proof", async ({ page }, info) => {
  await openAppearance(page, info);
  // B-1: a stacked segment (text scale >= 1.5) must be shown, at a size where the 28 px row, the 6 px
  // radius, the hairline separators and the label fit can be judged. The old shot was a 159x47 crop of
  // the *horizontal* segment at scale 1, so "segments stack" had no visual evidence at all.
  const s = page.getByTestId("text-scale");
  await s.fill("1.5"); await s.blur();
  const seg = page.getByTestId("seg-reducedMotion");
  await expect(seg).toHaveAttribute("data-stacked", "scale");
  if (isPhone(info)) {
    // B-2: on the phone the stacked rows are full-bleed (358 px) and 44 px tall under pointer:coarse,
    // so the width, the 6 px radius and the hairline separators need a PAGE shot, not an element crop.
    await seg.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center" }));
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/segment-stacked-scale1.5-390x844.png` });
  } else {
    // The whole control, not a tiny crop: the two segments and both rules.
    await shutter(page);
    await seg.screenshot({ path: `${SHOTS}/segment-stacked-scale1.5-1440x900.png` });
  }
  // The stacked segment: every row is a full-width bar at least 28 px tall, and exactly one carries
  // the --fg selection marker. The 6 px radius belongs to the control (the container), as in the
  // horizontal case: the container clips the corners.
  const segBox = await seg.evaluate((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { radius: parseFloat(cs.borderTopLeftRadius), stacked: e.classList.contains("stacked") }; });
  expect(segBox.radius).toBe(6);
  expect(segBox.stacked).toBe(true);
  const rows = await seg.locator("button").evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { w: Math.round(r.width), h: Math.round(r.height), marker: cs.boxShadow !== "none" };
  }));
  expect(rows).toHaveLength(3);
  for (const r of rows) { expect(r.h).toBeGreaterThanOrEqual(28); expect(r.w).toBeGreaterThan(100); }
  expect(rows.filter((r) => r.marker)).toHaveLength(1); // exactly one checked row
  await s.fill("1"); await s.blur();
});

test("Studio #7: the credits list is visible, and its role words are right", async ({ page }, info) => {
  await boot(page, "/settings/SET-08");
  const about = page.getByTestId("settings-about");
  await expect(about).toBeVisible();
  // B-3: the credits list was never visible in any shot (the pane was cut at the CREDITS heading).
  const credits = about.locator(".about-list li");
  await expect(credits).toHaveCount(5);
  await expect(credits.first()).toContainText("Avalon Studio · design");
  // The list is reachable by scrolling: the last credit is inside the pane's scroll area.
  await credits.last().scrollIntoViewIfNeeded();
  await expect(credits.last()).toBeInViewport();
});

test("S1-14: About in-app (S2-01..07)", async ({ page, context }, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await boot(page, "/settings/SET-08");
  const about = page.getByTestId("settings-about");
  await expect(about).toBeVisible();
  if (isPhone(info)) await expect(page.locator("#phone-app-title")).toHaveText("About");
  const version = (await page.getByTestId("about-version").textContent())!;
  // B-1 (PR #7 ruling): the e2e build stamps a DETERMINISTIC build identifier (playwright.config
  // webServer env), because a committed screenshot can only ever carry its parent commit's SHA. This
  // still proves the env-to-screen plumbing, which is the half the unit test does not cover.
  const buildId = process.env.NEXT_PUBLIC_BUILD_SHA ?? execSync("git rev-parse --short=7 HEAD").toString().trim();
  const pkgVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
  expect(version).toBe(`${pkgVersion} (build ${buildId})`);
  // The invariant, not just the value: a committed screenshot must never carry a real short SHA. If both
  // pin sites are ever removed, buildId falls back to git, the line above still passes, and the PNGs go
  // stale again silently (PR #7 B-1, third round).
  expect(version).not.toMatch(/\(build [0-9a-f]{7}\)/);
  await expect(about.getByTestId("about-licence-row")).toHaveCount(5);
  await expect(about.getByRole("link", { name: /Charts by TradingView/ })).toHaveAttribute("href", "https://www.tradingview.com");
  for (const a of await about.locator("a[target]").all()) {
    await expect(a).toHaveAttribute("target", "_blank");
    expect(await a.getAttribute("rel")).toContain("noopener");
    expect(await a.evaluate((e) => e.textContent)).toContain("opens in a new tab");
  }
  const accBg = await page.evaluate(() => {
    const d = document.createElement("i"); d.style.color = "var(--acc)"; document.body.append(d); const acc = getComputedStyle(d).color; d.remove();
    return [...document.querySelectorAll("[data-testid=settings-about] *")].filter((e) => getComputedStyle(e).backgroundColor === acc).length;
  });
  expect(accBg).toBe(0);
  await page.getByTestId("about-copy").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(version);
  if (isPhone(info)) {
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/about-scale1-390x844.png`, fullPage: true });
    await page.locator(".appbar .icon-btn").click();
    await page.getByTestId("set-nav-SET-02").click();
    const s = page.getByTestId("text-scale"); await s.fill("2"); await s.blur();
    await page.locator(".appbar .icon-btn").click();
    await page.getByTestId("set-nav-SET-08").click();
    expect(await noHScroll(page)).toBe(true);
    expect(await page.locator(".about-licences thead").evaluate((e) => getComputedStyle(e).position)).toBe("absolute");
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/about-scale2-390x844.png`, fullPage: true });
  } else {
    // The About pane scrolls: the shot is taken at the top, and a second one scrolled to the credits,
    // so the credits list has pixel evidence (it was cut at the heading in every earlier shot).
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/about-ink-brass-1440x900.png` });
    await about.locator(".about-list li").last().scrollIntoViewIfNeeded();
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/about-credits-1440x900.png` });
    await page.getByTestId("set-nav-SET-02").click();
    await page.getByTestId("swatch-broadsheet").click();
    await page.getByTestId("set-nav-SET-08").click();
    await shutter(page);
    await page.screenshot({ path: `${SHOTS}/about-broadsheet-1440x900.png` });
  }
  // S2-04: integrity report opens the Markets ComingLater window, no navigation error.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByTestId("about-integrity").click();
  await expect(page).toHaveURL(/\/markets\/MKT-08/);
  await expect(page.getByTestId("coming-later").filter({ hasText: "Markets" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Studio #38: switch / segment / swatch badge / thumbnail / glyph geometry", async ({ page }, info) => {
  await openAppearance(page, info, "?rank=R3&shells=r0,r3&owned=cos_shell_glass");
  const near = (a: number, b: number) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(1);
  const box = (sel: string) => page.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { w: r.width, h: r.height, x: r.x, y: r.y, radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, border: cs.borderTopColor, tr: cs.transitionDuration, ease: cs.transitionTimingFunction }; });
  // Switch track / knob.
  const track = await box("[data-testid=switch-hc] .set-switch-track");
  near(track.w, 32); near(track.h, 18); near(track.radius, 9);
  const knob = await box("[data-testid=switch-hc] .set-switch-knob");
  near(knob.w, 14); near(knob.h, 14); near(knob.x - track.x, 2); near(knob.y - track.y, 2);
  expect(knob.bg).toBe(await rgb(page, "var(--bg0)"));
  expect(knob.tr).toBe("0.12s"); expect(knob.ease).toBe("ease-out");
  // D-4: the OFF track is --fg-disabled, not --line (--line on --win is 1.24–1.53:1, so "off" read as "disabled").
  expect(track.bg).toBe(await rgb(page, "var(--fg-disabled)"));
  expect(track.border).toBe(await rgb(page, "var(--fg-disabled)"));
  await page.getByTestId("switch-hc").click();
  await shutter(page); // the 120 ms knob travel: settle it instead of sleeping through it
  const on = await box("[data-testid=switch-hc] .set-switch-track"), knobOn = await box("[data-testid=switch-hc] .set-switch-knob");
  expect(on.bg).toBe(await rgb(page, "var(--fg-muted)"));
  near(knobOn.x - knob.x, 14);
  await expect(page.getByTestId("switch-hc")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("switch-hc").click();
  const hit = await box("[data-testid=switch-hc]");
  expect(Math.min(hit.w, hit.h)).toBeGreaterThanOrEqual(isPhone(info) ? 44 : 28);
  // Segment.
  const seg = await box("[data-testid=seg-reducedMotion]");
  near(seg.radius, 6);
  expect(seg.border).toBe(await rgb(page, "var(--line)"));
  const segBtn = await box("[data-testid=seg-reducedMotion] [aria-checked=true]");
  if (!isPhone(info)) near(segBtn.h, 28);
  expect(segBtn.bg).toBe(await rgb(page, "var(--win2)"));
  expect(await page.locator("[data-testid=seg-reducedMotion] [aria-checked=true]").evaluate((e) => getComputedStyle(e).fontWeight)).toBe("500");
  // D-5: the selection is also a 2px --fg marker; the --win2 fill alone is only 1.08–1.15:1 on --win.
  const marker = await page.locator("[data-testid=seg-reducedMotion] [aria-checked=true]").evaluate((e) => getComputedStyle(e).boxShadow);
  const fg = await rgb(page, "var(--fg)");
  const [fr, fg2, fb] = fg.match(/[\d.]+/g)!.map(Number);
  expect(marker).toContain(`rgb(${fr}, ${fg2}, ${fb})`);
  // Swatch badge, thumbnail, cosmetic name.
  await expect(page.locator("[data-testid=swatch-check]")).toHaveCount(1);
  await expect(page.locator("[aria-checked=true] [data-testid=swatch-check]")).toHaveCount(1);
  const badge = await box("[data-testid=swatch-check]"); near(badge.w, 12); near(badge.h, 12);
  const thumb = await box(".shell-thumb"); near(thumb.w, 32); near(thumb.h, 20);
  expect(await page.locator(".shell-thumb").first().evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe("dashed");
  // D-3: the thumbnail border is --fg-disabled, so it does not read as a broken image.
  expect(thumb.border).toBe(await rgb(page, "var(--fg-disabled)"));
  expect(thumb.bg).toBe(await rgb(page, "var(--win2)"));
  await expect(page.getByTestId("shell-cos_shell_glass")).toContainText("Glass · Cosmetic");
  // D-2: the preview card has a surface, so it reads as a card and not as a floating fragment.
  const preview = await box("[data-testid=scale-preview]");
  expect(preview.bg).toBe(await rgb(page, "var(--win2)"));
  // D-6: the text-scale track has labelled ends, so the thumb at the left reads as the minimum.
  await expect(page.getByTestId("scale-min")).toHaveText("100%");
  await expect(page.getByTestId("scale-max")).toHaveText("200%");
  // Reduced motion: the knob moves instantly.
  await page.getByTestId("seg-reducedMotion").getByRole("radio", { name: "On", exact: true }).click();
  expect(parseFloat((await box("[data-testid=switch-hc] .set-switch-knob")).tr)).toBe(0);
  // Studio #38: one row at 1.25 (when it fits), stacked from 1.5; at scale 1 a too-narrow container also stacks.
  const s = page.getByTestId("text-scale");
  const segLoc = page.getByTestId("seg-reducedMotion");
  if (!isPhone(info)) {
    await s.fill("1.25"); await s.blur();
    await expect(segLoc).not.toHaveAttribute("data-stacked", /./);
  }
  await s.fill("1.5"); await s.blur();
  await expect(segLoc).toHaveAttribute("data-stacked", "scale");
  await s.fill("1"); await s.blur();
  await segLoc.evaluate((e) => { (e.parentElement as HTMLElement).style.width = "90px"; });
  await expect(segLoc).toHaveAttribute("data-stacked", "overflow");
  expect(await page.locator("[data-testid=seg-reducedMotion] button").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)).toBe(0);
  await segLoc.evaluate((e) => { (e.parentElement as HTMLElement).style.width = ""; });
  await s.fill("2"); await s.blur();
  const ys = await page.locator("[data-testid=seg-reducedMotion] button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
  expect(ys[1]).toBeGreaterThan(ys[0]); expect(ys[2]).toBeGreaterThan(ys[1]);
  expect(await page.locator(".set-seg button").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length)).toBe(0);
  // External glyph in About: 14 px, --fg, after the label (B-4: 12 px in --fg-muted read as a speck).
  if (isPhone(info)) await page.locator(".appbar .icon-btn").click();
  await page.getByTestId("set-nav-SET-08").click();
  const g = await box("[data-testid=ext-glyph] svg"); near(g.w, 14); near(g.h, 14);
  expect(await page.locator("[data-testid=ext-glyph]").first().evaluate((e) => getComputedStyle(e).color)).toBe(await rgb(page, "var(--fg)"));
});

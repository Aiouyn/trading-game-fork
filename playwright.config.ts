import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

// The build identifier the e2e build stamps on the About screen (17B SET-08, PR #7 B-1 ruling).
// A committed screenshot cannot carry a git SHA: the shoot runs in the tree whose HEAD is the PARENT of
// the commit that carries the PNG, so the SHA would be stale by construction. A deterministic token is
// stable across re-shoots; a real build has no pin and still shows the real short commit.
const BUILD_SHA = "e2e-fixture";
process.env.NEXT_PUBLIC_BUILD_SHA = BUILD_SHA;

export default defineConfig({
  testDir: "tests/e2e",
  // City e2e runs only with its own config/harness (tests/e2e/city/playwright.config.ts), never against the Next app.
  testIgnore: ["city/**"],
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    // QUAY_DS=1 serves the dev-only /__ds primitives sheet in the production build (17A T1).
    // NEXT_PUBLIC_BUILD_SHA pins the About version line (see BUILD_SHA above), so the PNG is stable.
    env: { QUAY_DS: "1", QUAY_HOOKS: "1", NEXT_PUBLIC_BUILD_SHA: BUILD_SHA, NEXT_PUBLIC_QUAY_MOCK_PHASE: "1", NEXT_PUBLIC_QUAY_MOCK_CITY_FAIL: "1", NEXT_PUBLIC_QUAY_MOCK_LOAD_FAIL: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
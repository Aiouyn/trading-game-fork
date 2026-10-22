// @vitest-environment happy-dom
// 17A T4: the Recent list cap. The e2e spec can only open a couple of apps, so the "up to 6" cap
// (17 §3.2.3) is never exercised there; this pins it directly against the rendered component.
// Written with createElement (no JSX) so it runs under the current vitest include, which covers
// tests/unit/**/*.test.ts.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppId } from "@/shell/registry";
import type { ShellState } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const APPS: AppId[] = ["broker", "portfolio", "wire", "messages", "markets", "risk", "quantlab", "research"];

let recent: AppId[] = [];
vi.mock("@/components/shell/ShellContext", () => ({
  useShell: <T,>(sel: (s: unknown) => T): T => sel({ recent } as unknown as ShellState),
  useShellStore: () => ({ getState: () => ({ setRecent: () => {}, open: () => {} }) }),
}));

import { Recent } from "@/components/shell/Recent";

beforeEach(() => { recent = []; });
afterEach(() => { recent = []; });

async function render(): Promise<HTMLElement> {
  const el = document.createElement("div");
  const root = createRoot(el);
  await act(async () => { root.render(createElement(Recent)); });
  return el;
}

it("Recent shows at most 6 apps (17 §3.2.3), most recent first", async () => {
  recent = APPS;
  const el = await render();
  const items = [...el.querySelectorAll("[data-testid=recent-item]")];
  expect(items).toHaveLength(6);
  // The six most recent, in order.
  expect(items.map((i) => i.textContent)).toEqual(["Broker", "Portfolio", "Wire", "Messages", "Markets", "Risk"]);
});

it("Recent shows fewer than 6 when fewer apps are open", async () => {
  recent = ["wire", "portfolio"];
  const el = await render();
  expect(el.querySelectorAll("[data-testid=recent-item]")).toHaveLength(2);
});

it("Recent with nothing open shows the empty message", async () => {
  const el = await render();
  expect(el.querySelectorAll("[data-testid=recent-item]")).toHaveLength(0);
  expect(el.textContent).toContain("Nothing open yet.");
});

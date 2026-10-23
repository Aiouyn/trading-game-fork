// @vitest-environment happy-dom
// 17B S1-06: the "Purchased" chip follows E-64 §3 `labelPurchased` -- not owned.includes(id), and not the row's copy.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ShellPicker } from "@/apps/settings/ShellPicker";
import { ShellCtx } from "@/components/shell/ShellContext";
import { parseEntitlements, type AcctEntitlements } from "@/shell/channels";
import { mockChannels } from "@/shell/mockChannels";
import { createShellStore } from "@/shell/store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** An `acct:entitlements` payload through the real parser (E-64 §3 shape). */
const ent = (rows: { itemId: string; labelPurchased: boolean }[]): AcctEntitlements =>
  parseEntitlements({
    items: rows.map((r) => ({ itemId: r.itemId, slot: "SHELL_STYLE", source: "purchase", labelPurchased: r.labelPurchased, grantedAt: "2026-10-01T00:00:00Z" })),
  });

/** R0 owns r0; the two cosmetic shells below are listed because they are SHELL_STYLE entitlements. */
function mount(entitlements: AcctEntitlements) {
  const channels = mockChannels(new URLSearchParams("rank=R0&shells=r0"));
  const store = createShellStore(channels);
  store.getState().setChannels({ ...channels, entitlements });
  const el = document.createElement("div");
  document.body.append(el);
  act(() => createRoot(el).render(<ShellCtx.Provider value={store}><ShellPicker /></ShellCtx.Provider>));
  return el;
}

const chip = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="shell-${id}"] [data-testid="purchased"]`);
afterEach(() => { document.body.innerHTML = ""; });

describe("17B S1-06 Purchased chip", () => {
  it("shows the chip on a labelPurchased row only: true yes, false no, every other row no", () => {
    const el = mount(ent([{ itemId: "cos_shell_brass", labelPurchased: true }, { itemId: "cos_shell_glass", labelPurchased: false }]));
    expect(el.querySelectorAll(".shell-row")).toHaveLength(3); // r0 + the two cosmetics, so the chip assertions are not vacuous
    expect(chip(el, "cos_shell_brass")?.textContent).toBe("Purchased");
    expect(chip(el, "cos_shell_glass")).toBeNull();   // owned row, labelPurchased false: no chip
    expect(chip(el, "r0")).toBeNull();                // earned row: no chip
    expect(el.querySelectorAll('[data-testid="purchased"]')).toHaveLength(1);
  });

  it("moves the chip with the field, not with the row: flipping labelPurchased moves it", () => {
    const onGlass = mount(ent([{ itemId: "cos_shell_glass", labelPurchased: true }]));
    expect(chip(onGlass, "cos_shell_glass")?.textContent).toBe("Purchased");
    expect(onGlass.querySelectorAll('[data-testid="purchased"]')).toHaveLength(1);
    document.body.innerHTML = "";
    const offGlass = mount(ent([{ itemId: "cos_shell_glass", labelPurchased: false }]));
    expect(chip(offGlass, "cos_shell_glass")).toBeNull();
    expect(offGlass.querySelectorAll('[data-testid="purchased"]')).toHaveLength(0);
  });
});

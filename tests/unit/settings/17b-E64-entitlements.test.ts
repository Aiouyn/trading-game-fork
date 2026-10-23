// Systems ruling E-64: acct:entitlements parser (mirrors GET /api/v1/me/entitlements) and owned shells.
import { describe, expect, it } from "vitest";
import { ownedShells, parseEntitlements } from "@/shell/channels";

const item = (itemId: string, extra: Record<string, unknown> = {}) => ({
  itemId, slot: "SHELL_STYLE", source: "purchase", labelPurchased: true, grantedAt: "2026-10-01T12:00:00Z", ...extra,
});

describe("E-64 acct:entitlements", () => {
  it("accepts a valid, sorted, unique list and picks SHELL_STYLE items as owned shells", () => {
    const e = parseEntitlements({ items: [item("cos_shell_brass"), item("cos_shell_glass"), item("emote_wave", { slot: "EMOTE" })] });
    expect(ownedShells(e)).toEqual(["cos_shell_brass", "cos_shell_glass"]);
    expect(parseEntitlements({ items: [] }).items).toEqual([]);
  });
  it.each(["itemId", "slot", "source", "labelPurchased", "grantedAt"])("rejects a missing %s", (k) => {
    const it0: Record<string, unknown> = item("cos_shell_glass");
    delete it0[k];
    expect(() => parseEntitlements({ items: [it0] })).toThrow(/missing/);
  });
  it.each(["2026-10-01", "2026-10-01T12:00:00+02:00", "yesterday", "2026-13-40T99:00:00Z"])("rejects grantedAt %s", (g) => {
    expect(() => parseEntitlements({ items: [item("cos_shell_glass", { grantedAt: g })] })).toThrow(/grantedAt/);
  });
  it("rejects unsorted and duplicate itemIds", () => {
    expect(() => parseEntitlements({ items: [item("cos_shell_glass"), item("cos_shell_brass")] })).toThrow(/sorted/);
    expect(() => parseEntitlements({ items: [item("cos_shell_glass"), item("cos_shell_glass")] })).toThrow(/duplicate/);
  });
  it.each(["accountId", "entitlementId", "purchaseId", "price", "priceCents"])("rejects forbidden field %s", (k) => {
    expect(() => parseEntitlements({ items: [item("cos_shell_glass", { [k]: "x" })] })).toThrow(/forbidden/);
  });
  it("rejects a missing items array and unknown fields", () => {
    expect(() => parseEntitlements({})).toThrow();
    expect(() => parseEntitlements({ items: [], accountId: "a" })).toThrow();
    expect(() => parseEntitlements({ items: [item("cos_shell_glass", { colour: "x" })] })).toThrow(/unexpected/);
  });
  // E-64 §3: `labelPurchased: boolean`. A string is rejected, never coerced -- "no" is truthy, so coercion would
  // display a refunded item as purchased.
  it("accepts a boolean labelPurchased and rejects every string form", () => {
    const row = (v: unknown) => item("cos_shell_glass", { labelPurchased: v });
    for (const s of ["Purchased", "no", "false", "", "0"]) expect(() => parseEntitlements({ items: [row(s)] })).toThrow(/labelPurchased/);
    for (const v of [1, null, {}]) expect(() => parseEntitlements({ items: [row(v)] })).toThrow(/labelPurchased/);
    expect(parseEntitlements({ items: [row(true)] }).items[0].labelPurchased).toBe(true);
    expect(parseEntitlements({ items: [row(false)] }).items[0].labelPurchased).toBe(false);
  });
  it("ownedShells keeps SHELL_STYLE items with a cos_shell_ id and drops each of the two non-reasons", () => {
    const e = parseEntitlements({ items: [
      item("cos_badge_gold"),                    // SHELL_STYLE slot, but not a shell id
      item("cos_shell_emote", { slot: "EMOTE" }), // a shell id, but the wrong slot
      item("cos_shell_glass"),                   // owned: both hold
    ] });
    expect(ownedShells(e)).toEqual(["cos_shell_glass"]);
  });
});

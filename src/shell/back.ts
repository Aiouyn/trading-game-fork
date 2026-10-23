"use client";
// Back behaviour (17A T4 §5) [P]. Browser history mirrors the shell so hardware/browser Back, the app-bar chevron
// and the left-edge swipe all do the same thing.
// - Phone: a stack Home (0) → app (1) → in-app screen (2). Each level is a pushState; Back pops one level; at Home
//   Back does nothing (no exit: there is nothing below level 0 that we created).
// - Desktop: each change of the focused window pushes its URL. Back refocuses the previously focused window; it
//   never closes windows or discards drafts.
import { useEffect, useSyncExternalStore } from "react";
import type { AppId } from "./registry";
import type { ShellStore } from "./store";
import type { WindowRect } from "./types";
import { viewportOf } from "./wm";

type PhoneEntry = { quay: "phone"; lvl: 0 | 1 | 2; app?: AppId; context?: string; screen?: string };
type DeskEntry = { quay: "desk"; app?: AppId; instance?: number };
type Entry = PhoneEntry | DeskEntry;

/** URL of a window (or home): `/{app}` plus `?asset=` for a Broker ticker. */
export const urlOf = (w: Pick<WindowRect, "app" | "context"> | null | undefined, screen?: string) =>
  !w ? "/" : `/${w.app}${screen ? `/${screen}` : ""}${w.context ? `?asset=${encodeURIComponent(w.context)}` : ""}`;

/**
 * The App Router owns the URL; the shell's history mirror must not fight it.
 *
 * A deep link is a two-segment route (`/{app}/{screen}`, e.g. /settings/SET-08 — 17B SET-01). The mirror used
 * to write the shorter `/{app}` for the focused window, so it overwrote the router's URL: the deep link was
 * lost, and because Next patches `history.pushState` / `replaceState` to sync its own router state, the
 * router's state was clobbered too. That is what made the S1-02 / boot-once e2e flaky (17B S1-02).
 *
 * The mirror therefore mirrors the router's *live* URL whenever the router is showing the same app: the
 * live URL carries the screen segment and the query, and the mirror must not shorten or strip either.
 * The live URL is read at write time, so it can never be a stale snapshot of an earlier route.
 */
const livePath = () => (typeof location === "undefined" ? "" : location.pathname);
const liveSearch = () => (typeof location === "undefined" ? "" : location.search);

/** The URL the mirror writes for a focused window: the router's own live URL when it shows the same app. */
const mirrorUrl = (w: Pick<WindowRect, "app" | "context"> | null | undefined): string => {
  if (!w) return "/";
  const path = livePath();
  // The router is showing this app (first path segment): keep its route, only the asset is the mirror's own.
  const same = path === `/${w.app}` || path.startsWith(`/${w.app}/`);
  if (!same) return urlOf(w);
  const q = new URLSearchParams(liveSearch());
  if (w.context) q.set("asset", w.context);
  else q.delete("asset");
  const query = q.toString();
  return `${path}${query ? `?${query}` : ""}`;
};

// Current phone in-app screen (level 2), readable by PhoneHome.
let screen: string | null = null;
const listeners = new Set<() => void>();
const setScreen = (s: string | null) => { screen = s; listeners.forEach((l) => l()); };
export const usePhoneScreen = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => screen, () => null);

const state = (): Entry | null => (history.state && typeof history.state === "object" && "quay" in history.state ? history.state as Entry : null);

/** One level back (chevron, edge swipe). At phone Home it does nothing. */
export function goBack(): void {
  const s = state();
  if (s?.quay === "phone" && s.lvl === 0) return;
  history.back();
}

const focusedOf = (st: ReturnType<ShellStore["getState"]>) =>
  st.local.windows.filter((w) => w.workspace === st.local.activeWorkspace).at(-1) ?? null;

const write = (e: Entry, url: string, replace = false) => {
  if (replace) history.replaceState(e, "", url); else history.pushState(e, "", url);
};
/** Seeded entries (the load's own entry and its deep-link stack) keep the load's query string, so state the page was loaded with (mock channel
 *  params, e2e hooks such as ?city=fail read later by lazily mounted apps) is not dropped by the rewrite. */
const withLoadQuery = (url: string) => (url.includes("?") ? url : url + location.search);

/**
 * Seed history for the page load, after the deep link (if any) is applied. On phone a deep link builds the whole
 * stack (Home, app, screen) so Back pops level by level. `screenId` is the deep link's second segment.
 */
let seeded = false;
export function seedHistory(store: ShellStore, screenId?: string): void {
  seeded = true;
  const st = store.getState();
  if (viewportOf(st.vw) === "phone") {
    const a = st.phoneApp;
    write({ quay: "phone", lvl: 0 }, withLoadQuery("/"), true);
    if (!a) return;
    write({ quay: "phone", lvl: 1, app: a.app, context: a.context }, withLoadQuery(urlOf(a)));
    if (screenId) { setScreen(screenId); write({ quay: "phone", lvl: 2, app: a.app, context: a.context, screen: screenId }, withLoadQuery(urlOf(a, screenId))); }
  } else {
    const f = focusedOf(st);
    write({ quay: "desk", app: f?.app, instance: f?.instance }, withLoadQuery(mirrorUrl(f)), true);
  }
}

/** Wire the shell store to browser history: each new phone level or focused desktop window is one entry. */
export function useBackStack(store: ShellStore): void {
  useEffect(() => {
    let applying = false;
    const phone = () => viewportOf(store.getState().vw) === "phone";
    const push = write;
    const unsub = store.subscribe((st, prev) => {
      if (applying || !seeded) return;
      if (phone()) {
        if (st.phoneApp && st.phoneApp !== prev.phoneApp) {
          setScreen(null);
          push({ quay: "phone", lvl: 1, app: st.phoneApp.app, context: st.phoneApp.context }, urlOf(st.phoneApp));
        } else if (!st.phoneApp && prev.phoneApp) {
          // Home via the status-bar mark or the edge-bar swipe: this entry becomes Home; Back from it stays Home.
          setScreen(null);
          push({ quay: "phone", lvl: 0 }, "/", true);
        }
        return;
      }
      const f = focusedOf(st), pf = focusedOf(prev);
      if (f && (!pf || f.app !== pf.app || f.instance !== pf.instance)) push({ quay: "desk", app: f.app, instance: f.instance }, mirrorUrl(f));
      else if (f && pf && f.context !== pf.context) push({ quay: "desk", app: f.app, instance: f.instance }, mirrorUrl(f), true);
    });

    const onPop = () => {
      const e = state();
      if (!e) return;
      applying = true;
      try {
        if (e.quay === "phone") {
          setScreen(e.lvl === 2 ? e.screen ?? null : null);
          store.setState({ phoneApp: e.lvl === 0 || !e.app ? null : { app: e.app, context: e.context } });
        } else if (e.app) {
          const st = store.getState();
          const w = st.local.windows.find((x) => x.app === e.app && x.instance === e.instance);
          if (w) st.focus(w); // refocus only: never close, never re-create
        }
      } finally { applying = false; }
    };
    window.addEventListener("popstate", onPop);
    return () => { unsub(); window.removeEventListener("popstate", onPop); };
  }, [store]);
}

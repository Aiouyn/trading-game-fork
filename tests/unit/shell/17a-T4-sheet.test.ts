// @vitest-environment happy-dom
// 17A T4 follow-up: the shared Sheet's dismissal contract.
//
// The defect QA found (fork PR #8): the scrim dismissed on CLICK, so the release click that a long-press
// produces — a trusted click at the release coordinates, landing on the scrim the sheet had just created —
// closed the sheet the finger had just opened. A touch user could never reach Recent.
//
// The contract pinned here:
//   1. the scrim dismisses on POINTERDOWN (a press that STARTS on the scrim),
//   2. a bare CLICK on the scrim does NOT dismiss it (the release click of the opening gesture),
//   3. a pointerdown that starts elsewhere does not dismiss it either (the target guard),
//   4. focus returns to the EXPLICIT opener, not to whatever happened to be focused at mount — a finger
//      does not focus the button it long-presses, so document.activeElement at mount is <body>.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let closed = 0;
const onClose = () => { closed++; };

import { Sheet } from "@/components/shell/Sheet";

const mount = async (props: Partial<React.ComponentProps<typeof Sheet>> = {}) => {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => { root.render(createElement(Sheet, { label: "Recent", onClose, children: null, ...props })); });
  return { el, root };
};

const scrimOf = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-testid="sheet-scrim"]')!;

beforeEach(() => { closed = 0; document.body.innerHTML = ""; });
afterEach(() => { document.body.innerHTML = ""; });

it("the scrim dismisses the sheet on a pointerdown that starts on it", async () => {
  const { el } = await mount();
  expect(closed).toBe(0);
  const down = new Event("pointerdown", { bubbles: true, cancelable: true });
  scrimOf(el).dispatchEvent(down);
  expect(closed).toBe(1);
});

it("a bare click on the scrim does NOT dismiss the sheet (the opening gesture's release)", async () => {
  const { el } = await mount();
  // No pointerdown: this is the browser-synthesised release click of a long-press that opened the sheet.
  scrimOf(el).dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  expect(closed).toBe(0);
});

it("a pointerdown that starts elsewhere does not dismiss the sheet (the target guard)", async () => {
  const { el } = await mount();
  // A press that started on the sheet body and was released over the scrim: the scrim is not the target.
  const down = new Event("pointerdown", { bubbles: true, cancelable: true });
  el.querySelector<HTMLElement>('[data-testid="sheet"]')!.dispatchEvent(down);
  expect(closed).toBe(0);
});

it("focus returns to the explicit opener, even when nothing was focused at mount", async () => {
  const opener = document.createElement("button");
  opener.dataset.testid = "quay-mark";
  document.body.append(opener);
  (document.activeElement as HTMLElement | null)?.blur(); // a finger never focuses the button it presses
  expect(document.activeElement).toBe(document.body);
  const ref = { current: opener };
  const { el, root } = await mount({ returnFocusTo: ref });
  // The sheet takes focus for itself on mount.
  expect(document.activeElement).not.toBe(opener);
  await act(async () => { root.unmount(); });
  expect(document.activeElement).toBe(opener);
  void el;
});

it("without an explicit opener, focus returns to what was focused at mount", async () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  expect(document.activeElement).toBe(opener);
  const { root } = await mount();
  await act(async () => { root.unmount(); });
  expect(document.activeElement).toBe(opener);
});

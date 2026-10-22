"use client";
// 17A T5 §5: Sheet (17 §3.3.3). Bottom (phone) or right (desktop). Focus trap, Esc / scrim tap closes, focus
// returns to the opener. role="dialog" + aria-modal. No backdrop-filter, ever [P].
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Sheet({ side = "bottom", label, onClose, children, testId = "sheet", returnFocusTo }: {
  side?: "bottom" | "right"; label: string; onClose: () => void; children: ReactNode; testId?: string;
  /**
   * The element focus returns to when the sheet closes. Explicit, because the opener is NOT always
   * `document.activeElement` at mount: a finger does not focus the button it long-presses, so reading the
   * active element at mount captures <body> and the focus restore lands on the body instead of the opener.
   * When omitted, the active element at mount is used (the keyboard path, where it IS the opener).
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  // The opener is read on close, not at mount: the sheet's owner resolves it (the Quay mark is mounted by
  // the phone shell, not by the sheet), and the ref object itself never changes.
  const opener = useRef(returnFocusTo);
  useEffect(() => { opener.current = returnFocusTo; });
  useEffect(() => {
    // Fallback opener: whatever was focused when the sheet mounted (the keyboard path).
    const mounted = document.activeElement as HTMLElement | null;
    const el = ref.current!;
    (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab") return;
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (f.length === 0) { e.preventDefault(); el.focus(); return; }
      const first = f[0]!, last = f.at(-1)!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      // The explicit opener wins over the element that happened to be focused at mount.
      (opener.current?.current ?? mounted)?.focus?.();
    };
  }, []);
  return (
    <div className="qs-layer" data-testid={`${testId}-layer`}>
      {/*
        The scrim dismisses on POINTERDOWN, never on click. The gesture that opens the sheet is a long-press:
        its pointerdown lands on the opener (the sheet does not exist yet), and the browser then synthesises a
        trusted click at the release coordinates, which land on the scrim the sheet just created. A click
        handler would therefore close the sheet the finger just opened, and a touch user could never reach
        Recent. Dismissing on pointerdown means only a gesture that STARTS on the scrim can dismiss it.
      */}
      <div className="qs-scrim" data-testid={`${testId}-scrim`} onPointerDown={(e) => { if (e.target === e.currentTarget) close.current(); }} />
      <div ref={ref} className={`qsheet qs-${side}`} data-testid={testId} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {side === "bottom" && <span className="qs-handle" aria-hidden="true" />}
        <div className="qs-body">{children}</div>
      </div>
    </div>
  );
}

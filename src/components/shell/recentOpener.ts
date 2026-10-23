"use client";
// The Recent sheet is opened by a long-press on the Quay mark (PhoneHome). The sheet must return focus to that
// mark when it closes, but a finger does not focus the button it long-presses, so the sheet cannot discover
// the opener from document.activeElement (that would capture <body>). The opener is therefore registered
// here, and the sheet reads it on close.
import { createRef, type RefObject } from "react";

/** The Quay mark: the only opener of the Recent sheet, and the element focus returns to. */
export const recentOpener: RefObject<HTMLButtonElement | null> = createRef();

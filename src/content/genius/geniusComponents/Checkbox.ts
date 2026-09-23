/** Genius's `Checkbox`, their own box rather than the browser's. */

import { createElement, type FC } from "react";
import type { CheckboxProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const checkboxSlot = slot<FC<CheckboxProps>>("Genius's Checkbox");

export const setCheckbox = checkboxSlot.set;

/** Whether this page bound it at all. */
export const hasCheckbox = (): boolean => checkboxSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Checkbox: FC<CheckboxProps> = (props) =>
    createElement(checkboxSlot.get(), props);

/** Genius's `DateInput`, the three release date dropdowns. */

import { createElement, type FC } from "react";
import type { DateInputProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const dateInputSlot = slot<FC<DateInputProps>>("Genius's DateInput");

export const setDateInput = dateInputSlot.set;

/** Whether this page bound it at all. */
export const hasDateInput = (): boolean => dateInputSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const DateInput: FC<DateInputProps> = (props) =>
    createElement(dateInputSlot.get(), props);

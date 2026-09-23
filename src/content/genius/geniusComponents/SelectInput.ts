/** Genius's `SelectInput`, a single choice dropdown. */

import { createElement, type FC } from "react";
import type { SelectInputProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const selectInputSlot = slot<FC<SelectInputProps>>(
    "Genius's SelectInput",
);

export const setSelectInput = selectInputSlot.set;

/** Whether this page bound it at all. */
export const hasSelectInput = (): boolean => selectInputSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const SelectInput: FC<SelectInputProps> = (props) =>
    createElement(selectInputSlot.get(), props);

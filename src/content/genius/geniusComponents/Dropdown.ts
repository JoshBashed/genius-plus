/** Genius's `Dropdown`, the menu a header trigger opens. */

import { createElement, type FC } from "react";
import type { DropdownProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const dropdownSlot = slot<FC<DropdownProps>>("Genius's Dropdown");

export const setDropdown = dropdownSlot.set;

/** Whether this page bound it at all. */
export const hasDropdown = (): boolean => dropdownSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Dropdown: FC<DropdownProps> = (props) =>
    createElement(dropdownSlot.get(), props);

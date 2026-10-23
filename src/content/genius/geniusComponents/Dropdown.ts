/** Genius's `Dropdown`, the menu a header trigger opens. */

import type { FC } from "react";
import type { DropdownProps } from "@/bindings";
import { renderSlot } from "@/content/genius/geniusComponents/renderSlot";
import { slot } from "@/content/genius/slot";

/** Exported whole so an install can record why a lookup failed. */
export const dropdownSlot = slot<FC<DropdownProps>>("Genius's Dropdown");

/** Whether this page bound it at all. */
export const hasDropdown = (): boolean => dropdownSlot.peek() !== null;

/** Their component, read at render, and nothing when this page lacks it. */
export const Dropdown: FC<DropdownProps> = (props) =>
    renderSlot(dropdownSlot, props);

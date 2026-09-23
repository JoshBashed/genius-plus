/** Genius's `Dropdown`, the menu a header trigger opens. */

import { createElement } from "react";
import {
    asPageValue,
    type DropdownProps,
    type PageComponent,
    type PageElement,
} from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const dropdownSlot =
    slot<PageComponent<DropdownProps>>("Genius's Dropdown");

export const setDropdown = dropdownSlot.set;

/** Whether this page bound it at all. */
export const hasDropdown = (): boolean => dropdownSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Dropdown = asPageValue<PageComponent<DropdownProps>>(
    (props: DropdownProps): PageElement =>
        createElement(dropdownSlot.get(), props),
);

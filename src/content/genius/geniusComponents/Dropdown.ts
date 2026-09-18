/** Genius's `Dropdown`, the menu a header trigger opens. */
import {
    asPageValue,
    type DropdownProps,
    type PageComponent,
    type PageElement,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

const dropdown = slot<PageComponent<DropdownProps>>("Genius's Dropdown");

export const setDropdown = dropdown.set;

/** Whether this page bound it at all. */
export const hasDropdown = (): boolean => dropdown.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Dropdown = asPageValue<PageComponent<DropdownProps>>(
    (props: DropdownProps): PageElement => createElement(dropdown.get(), props),
);

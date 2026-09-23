/** Genius's `Checkbox`, their own box rather than the browser's. */
import {
    asPageValue,
    type CheckboxProps,
    type PageComponent,
    type PageElement,
} from "@/bindings";
import { createElement } from "../react";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const checkboxSlot =
    slot<PageComponent<CheckboxProps>>("Genius's Checkbox");

export const setCheckbox = checkboxSlot.set;

/** Whether this page bound it at all. */
export const hasCheckbox = (): boolean => checkboxSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Checkbox = asPageValue<PageComponent<CheckboxProps>>(
    (props: CheckboxProps): PageElement =>
        createElement(checkboxSlot.get(), props),
);

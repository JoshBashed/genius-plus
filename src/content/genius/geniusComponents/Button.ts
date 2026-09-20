/** Genius's `Button`, the table's own primary control. */
import {
    asPageValue,
    type ButtonProps,
    type PageComponent,
    type PageElement,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

/** Exported whole so an install can record why a lookup failed. */
export const buttonSlot = slot<PageComponent<ButtonProps>>("Genius's Button");

export const setButton = buttonSlot.set;

/** Whether this page bound it at all. */
export const hasButton = (): boolean => buttonSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Button = asPageValue<PageComponent<ButtonProps>>(
    (props: ButtonProps): PageElement => createElement(buttonSlot.get(), props),
);

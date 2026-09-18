/** Genius's `Button`, the table's own primary control. */
import {
    asPageValue,
    type ButtonProps,
    type PageComponent,
    type PageElement,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

const button = slot<PageComponent<ButtonProps>>("Genius's Button");

export const setButton = button.set;

/** Whether this page bound it at all. */
export const hasButton = (): boolean => button.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Button = asPageValue<PageComponent<ButtonProps>>(
    (props: ButtonProps): PageElement => createElement(button.get(), props),
);

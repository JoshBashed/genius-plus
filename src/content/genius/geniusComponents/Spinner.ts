/** Genius's `Spinner`, their inline busy indicator. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SpinnerProps,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

const spinner = slot<PageComponent<SpinnerProps>>("Genius's Spinner");

export const setSpinner = spinner.set;

/** Whether this page bound it at all. */
export const hasSpinner = (): boolean => spinner.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Spinner = asPageValue<PageComponent<SpinnerProps>>(
    (props: SpinnerProps): PageElement => createElement(spinner.get(), props),
);

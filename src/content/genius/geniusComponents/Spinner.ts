/** Genius's `Spinner`, their inline busy indicator. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SpinnerProps,
} from "@/bindings";
import { createElement } from "../reactHost/react";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const spinnerSlot =
    slot<PageComponent<SpinnerProps>>("Genius's Spinner");

export const setSpinner = spinnerSlot.set;

/** Whether this page bound it at all. */
export const hasSpinner = (): boolean => spinnerSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Spinner = asPageValue<PageComponent<SpinnerProps>>(
    (props: SpinnerProps): PageElement =>
        createElement(spinnerSlot.get(), props),
);

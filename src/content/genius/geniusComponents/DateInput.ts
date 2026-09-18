/** Genius's `DateInput`, the three release date dropdowns. */
import {
    asPageValue,
    type DateInputProps,
    type PageComponent,
    type PageElement,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

const dateInput = slot<PageComponent<DateInputProps>>("Genius's DateInput");

export const setDateInput = dateInput.set;

/** Whether this page bound it at all. */
export const hasDateInput = (): boolean => dateInput.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const DateInput = asPageValue<PageComponent<DateInputProps>>(
    (props: DateInputProps): PageElement =>
        createElement(dateInput.get(), props),
);

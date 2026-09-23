/** Genius's `DateInput`, the three release date dropdowns. */
import {
    asPageValue,
    type DateInputProps,
    type PageComponent,
    type PageElement,
} from "@/bindings";
import { createElement } from "../react";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const dateInputSlot =
    slot<PageComponent<DateInputProps>>("Genius's DateInput");

export const setDateInput = dateInputSlot.set;

/** Whether this page bound it at all. */
export const hasDateInput = (): boolean => dateInputSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const DateInput = asPageValue<PageComponent<DateInputProps>>(
    (props: DateInputProps): PageElement =>
        createElement(dateInputSlot.get(), props),
);

/** Genius's `SelectInput`, a single choice dropdown. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SelectInputProps,
} from "@/bindings";
import { createElement } from "../reactHost/react";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const selectInputSlot = slot<PageComponent<SelectInputProps>>(
    "Genius's SelectInput",
);

export const setSelectInput = selectInputSlot.set;

/** Whether this page bound it at all. */
export const hasSelectInput = (): boolean => selectInputSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const SelectInput = asPageValue<PageComponent<SelectInputProps>>(
    (props: SelectInputProps): PageElement =>
        createElement(selectInputSlot.get(), props),
);

/** Genius's `SelectInput`, a single choice dropdown. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SelectInputProps,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

const selectInput = slot<PageComponent<SelectInputProps>>(
    "Genius's SelectInput",
);

export const setSelectInput = selectInput.set;

/** Whether this page bound it at all. */
export const hasSelectInput = (): boolean => selectInput.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const SelectInput = asPageValue<PageComponent<SelectInputProps>>(
    (props: SelectInputProps): PageElement =>
        createElement(selectInput.get(), props),
);

/** Genius's `TextInput`, a single line field. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type TextInputProps,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

const textInput = slot<PageComponent<TextInputProps>>("Genius's TextInput");

export const setTextInput = textInput.set;

/** Whether this page bound it at all. */
export const hasTextInput = (): boolean => textInput.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const TextInput = asPageValue<PageComponent<TextInputProps>>(
    (props: TextInputProps): PageElement =>
        createElement(textInput.get(), props),
);

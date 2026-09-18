/** Genius's `TagInput`, the chip field behind every credit. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type TagInputProps,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

const tagInput = slot<PageComponent<TagInputProps>>("Genius's TagInput");

export const setTagInput = tagInput.set;

/** Whether this page bound it at all. */
export const hasTagInput = (): boolean => tagInput.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const TagInput = asPageValue<PageComponent<TagInputProps>>(
    (props: TagInputProps): PageElement => createElement(tagInput.get(), props),
);

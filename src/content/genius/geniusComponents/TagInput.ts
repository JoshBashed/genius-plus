/** Genius's `TagInput`, the chip field behind every credit. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type TagInputProps,
} from "@/bindings";
import { createElement } from "../reactHost/react";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const tagInputSlot =
    slot<PageComponent<TagInputProps>>("Genius's TagInput");

export const setTagInput = tagInputSlot.set;

/** Whether this page bound it at all. */
export const hasTagInput = (): boolean => tagInputSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const TagInput = asPageValue<PageComponent<TagInputProps>>(
    (props: TagInputProps): PageElement =>
        createElement(tagInputSlot.get(), props),
);

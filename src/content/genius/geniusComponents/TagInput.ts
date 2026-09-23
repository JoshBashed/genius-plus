/** Genius's `TagInput`, the chip field behind every credit. */

import { createElement, type FC } from "react";
import type { TagInputProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const tagInputSlot = slot<FC<TagInputProps>>("Genius's TagInput");

export const setTagInput = tagInputSlot.set;

/** Whether this page bound it at all. */
export const hasTagInput = (): boolean => tagInputSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const TagInput: FC<TagInputProps> = (props) =>
    createElement(tagInputSlot.get(), props);

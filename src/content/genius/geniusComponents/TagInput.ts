/** Genius's `TagInput`, the chip field behind every credit. */

import type { FC } from "react";
import type { TagInputProps } from "@/bindings";
import { renderSlot } from "@/content/genius/geniusComponents/renderSlot";
import { slot } from "@/content/genius/slot";

/** Exported whole so an install can record why a lookup failed. */
export const tagInputSlot = slot<FC<TagInputProps>>("Genius's TagInput");

/** Their component, read at render, and nothing when this page lacks it. */
export const TagInput: FC<TagInputProps> = (props) =>
    renderSlot(tagInputSlot, props);

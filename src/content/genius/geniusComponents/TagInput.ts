/** Genius's `TagInput`, the chip field behind every credit. */

import type { FC } from "react";
import type { TagInputProps } from "@/bindings";
import { slot } from "../slot";
import { renderSlot } from "./renderSlot";

/** Exported whole so an install can record why a lookup failed. */
export const tagInputSlot = slot<FC<TagInputProps>>("Genius's TagInput");

/** Their component, read at render, and nothing when this page lacks it. */
export const TagInput: FC<TagInputProps> = (props) =>
    renderSlot(tagInputSlot, props);

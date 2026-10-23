/** Genius's `TextInput`, a single line field. */

import type { FC } from "react";
import type { TextInputProps } from "@/bindings";
import { renderSlot } from "@/content/genius/components/genius/renderSlot";
import { slot } from "@/content/genius/utilities/slot";

/** Exported whole so an install can record why a lookup failed. */
export const textInputSlot = slot<FC<TextInputProps>>("Genius's TextInput");

/** Their component, read at render, and nothing when this page lacks it. */
export const TextInput: FC<TextInputProps> = (props) =>
    renderSlot(textInputSlot, props);

/** Genius's `SelectInput`, a single choice dropdown. */

import type { FC } from "react";
import type { SelectInputProps } from "@/bindings";
import { renderSlot } from "@/content/genius/components/genius/renderSlot";
import { slot } from "@/content/genius/utilities/slot";

/** Exported whole so an install can record why a lookup failed. */
export const selectInputSlot = slot<FC<SelectInputProps>>(
    "Genius's SelectInput",
);

/** Their component, read at render, and nothing when this page lacks it. */
export const SelectInput: FC<SelectInputProps> = (props) =>
    renderSlot(selectInputSlot, props);

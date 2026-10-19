/** Genius's `DateInput`, the three release date dropdowns. */

import type { FC } from "react";
import type { DateInputProps } from "@/bindings";
import { slot } from "../slot";
import { renderSlot } from "./renderSlot";

/** Exported whole so an install can record why a lookup failed. */
export const dateInputSlot = slot<FC<DateInputProps>>("Genius's DateInput");

/** Their component, read at render, and nothing when this page lacks it. */
export const DateInput: FC<DateInputProps> = (props) =>
    renderSlot(dateInputSlot, props);

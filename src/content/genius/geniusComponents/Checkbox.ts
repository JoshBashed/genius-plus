/** Genius's `Checkbox`, their own box rather than the browser's. */

import type { FC } from "react";
import type { CheckboxProps } from "@/bindings";
import { slot } from "../slot";
import { renderSlot } from "./renderSlot";

/** Exported whole so an install can record why a lookup failed. */
export const checkboxSlot = slot<FC<CheckboxProps>>("Genius's Checkbox");

/** Their component, read at render, and nothing when this page lacks it. */
export const Checkbox: FC<CheckboxProps> = (props) =>
    renderSlot(checkboxSlot, props);

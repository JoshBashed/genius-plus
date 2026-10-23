/** Genius's `Spinner`, their inline busy indicator. */

import type { FC } from "react";
import type { SpinnerProps } from "@/bindings";
import { renderSlot } from "@/content/genius/components/genius/renderSlot";
import { slot } from "@/content/genius/utilities/slot";

/** Exported whole so an install can record why a lookup failed. */
export const spinnerSlot = slot<FC<SpinnerProps>>("Genius's Spinner");

/** Their component, read at render, and nothing when this page lacks it. */
export const Spinner: FC<SpinnerProps> = (props) =>
    renderSlot(spinnerSlot, props);

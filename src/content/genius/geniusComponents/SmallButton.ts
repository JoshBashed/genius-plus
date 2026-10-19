/** Genius's `SmallButton`, the compact control beside a row. */

import type { FC } from "react";
import type { SmallButtonProps } from "@/bindings";
import { slot } from "../slot";
import { renderSlot } from "./renderSlot";

/** Exported whole so an install can record why a lookup failed. */
export const smallButtonSlot = slot<FC<SmallButtonProps>>(
    "Genius's SmallButton",
);

/** Their component, read at render, and nothing when this page lacks it. */
export const SmallButton: FC<SmallButtonProps> = (props) =>
    renderSlot(smallButtonSlot, props);

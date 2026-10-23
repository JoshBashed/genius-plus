/** Genius's `Button`, the table's own primary control. */

import type { FC } from "react";
import type { ButtonProps } from "@/bindings";
import { renderSlot } from "@/content/genius/geniusComponents/renderSlot";
import { slot } from "@/content/genius/utilities/slot";

/** Exported whole so an install can record why a lookup failed. */
export const buttonSlot = slot<FC<ButtonProps>>("Genius's Button");

/** Their component, read at render, and nothing when this page lacks it. */
export const Button: FC<ButtonProps> = (props) => renderSlot(buttonSlot, props);

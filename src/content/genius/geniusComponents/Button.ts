/** Genius's `Button`, the table's own primary control. */

import { createElement, type FC } from "react";
import type { ButtonProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const buttonSlot = slot<FC<ButtonProps>>("Genius's Button");

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Button: FC<ButtonProps> = (props) =>
    createElement(buttonSlot.get(), props);

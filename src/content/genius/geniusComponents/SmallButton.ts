/** Genius's `SmallButton`, the compact control beside a row. */

import { createElement, type FC } from "react";
import type { SmallButtonProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const smallButtonSlot = slot<FC<SmallButtonProps>>(
    "Genius's SmallButton",
);

export const setSmallButton = smallButtonSlot.set;

/** Whether this page bound it at all. */
export const hasSmallButton = (): boolean => smallButtonSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const SmallButton: FC<SmallButtonProps> = (props) =>
    createElement(smallButtonSlot.get(), props);

/** Genius's `Spinner`, their inline busy indicator. */

import { createElement, type FC } from "react";
import type { SpinnerProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const spinnerSlot = slot<FC<SpinnerProps>>("Genius's Spinner");

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const Spinner: FC<SpinnerProps> = (props) =>
    createElement(spinnerSlot.get(), props);

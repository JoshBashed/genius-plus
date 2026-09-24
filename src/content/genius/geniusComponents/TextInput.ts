/** Genius's `TextInput`, a single line field. */

import { createElement, type FC } from "react";
import type { TextInputProps } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const textInputSlot = slot<FC<TextInputProps>>("Genius's TextInput");

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const TextInput: FC<TextInputProps> = (props) =>
    createElement(textInputSlot.get(), props);

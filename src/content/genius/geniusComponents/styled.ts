/** Genius's `styled-components` factory, and the theme it renders with. */
import type { FC } from "react";
import type { GeniusTheme, PageStyledFactory, PageStyledTag } from "@/bindings";
import { slot } from "../slot";

export const styledSlot = slot<PageStyledFactory>("styled-components");

export const setStyled = styledSlot.set;

/**
 * Their `styled`, called when a styles module is evaluated.
 *
 * Unlike a component, this one is read at import: `styled("div")` has to
 * return a component there and then. A module that calls it must
 * therefore still be imported after the binding is installed, which is
 * what the eager import in `mount` is for.
 */
export const styled = <Props>(tag: FC<Props> | string): PageStyledTag =>
    styledSlot.get()(tag);

export const themeSlot = slot<GeniusTheme>("the page's active theme");

export const setTheme = themeSlot.set;

/**
 * The live theme.
 * Read late, never snapshotted: `deviceType` changes on a resize, and a
 * re-prime replaces it without re-evaluating a single module.
 */
export const theme = (): GeniusTheme => themeSlot.get();

/** Genius's `styled-components` factory, and the theme it renders with. */
import type {
    GeniusTheme,
    PageComponent,
    PageStyledFactory,
    PageStyledTag,
} from "@/bindings";
import { slot } from "../reactHost/binding";

const factory = slot<PageStyledFactory>("styled-components");

export const setStyled = factory.set;

/**
 * Their `styled`, called when a styles module is evaluated.
 *
 * Unlike a component, this one is read at import: `styled("div")` has to
 * return a component there and then. A module that calls it must
 * therefore still be imported after the binding is installed, which is
 * what the eager import in `mount` is for.
 */
export const styled = <Props>(
    tag: PageComponent<Props> | string,
): PageStyledTag => factory.get()(tag);

const active = slot<GeniusTheme>("the page's active theme");

export const setTheme = active.set;

/**
 * The live theme.
 * Read late, never snapshotted: `deviceType` changes on a resize, and a
 * re-prime replaces it without re-evaluating a single module.
 */
export const theme = (): GeniusTheme => active.get();

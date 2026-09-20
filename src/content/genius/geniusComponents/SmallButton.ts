/** Genius's `SmallButton`, the compact control beside a row. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SmallButtonProps,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

/** Exported whole so an install can record why a lookup failed. */
export const smallButtonSlot = slot<PageComponent<SmallButtonProps>>(
    "Genius's SmallButton",
);

export const setSmallButton = smallButtonSlot.set;

/** Whether this page bound it at all. */
export const hasSmallButton = (): boolean => smallButtonSlot.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const SmallButton = asPageValue<PageComponent<SmallButtonProps>>(
    (props: SmallButtonProps): PageElement =>
        createElement(smallButtonSlot.get(), props),
);

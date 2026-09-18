/** Genius's `SmallButton`, the compact control beside a row. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SmallButtonProps,
} from "@/bindings";
import { slot } from "../reactHost/binding";
import { createElement } from "../reactHost/react";

const smallButton = slot<PageComponent<SmallButtonProps>>(
    "Genius's SmallButton",
);

export const setSmallButton = smallButton.set;

/** Whether this page bound it at all. */
export const hasSmallButton = (): boolean => smallButton.peek() !== null;

/**
 * Their component, read at render rather than at import.
 * @throws If nothing bound it; a component cannot return a `Result`.
 */
export const SmallButton = asPageValue<PageComponent<SmallButtonProps>>(
    (props: SmallButtonProps): PageElement =>
        createElement(smallButton.get(), props),
);

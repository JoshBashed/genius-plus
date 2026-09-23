/** Shapes for values owned by the page's React, in React's own types. */
import type { Context, FC, ReactElement, ReactNode } from "react";

/** A component from the page's React. */
export type PageComponent<Props> = FC<Props>;

/** An element built by the page's `createElement` / `jsx`. */
export type PageElement = ReactElement;

/** A context object from the page's React. */
export type PageContext<Value> = Context<Value>;

/** Anything the page's React accepts as a child. */
export type PageNode = ReactNode;

/** The subset of a synthetic event that behaves like a DOM event. */
export interface PageSyntheticEvent {
    readonly preventDefault: () => void;
    readonly stopPropagation: () => void;
    readonly currentTarget: Element;
    readonly target: EventTarget;
    readonly nativeEvent: Event;
}

/** The namespace object a dynamic `import()` resolves to. */
export type ModuleNamespace = Readonly<Record<string, unknown>>;

/** Asserts the shape a finder proved. Every cast goes through here. */
export const asPageValue = <T>(value: unknown): T => value as T;

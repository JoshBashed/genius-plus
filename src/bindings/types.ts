/** Branded shapes for values owned by the page's React, not ours. */

declare const componentBrand: unique symbol;
declare const elementBrand: unique symbol;
declare const contextBrand: unique symbol;

/** A component from the page's React. Render it, never call it. */
export interface PageComponent<Props> {
    (props: Props): PageElement;
    readonly [componentBrand]: Props;
}

/** An element built by the page's `createElement` / `jsx`. */
export interface PageElement {
    readonly [elementBrand]: "page-element";
}

/** A context object from the page's React. */
export interface PageContext<Value> {
    readonly [contextBrand]: Value;
}

/** Anything the page's React accepts as a child. */
export type PageNode =
    | PageElement
    | string
    | number
    | boolean
    | null
    | undefined
    | readonly PageNode[];

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

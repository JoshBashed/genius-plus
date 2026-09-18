import { Result } from "@resulted/results";
import type { AppResult } from "@/utilities/result";
import { findByKeys, missingKeys } from "./finders";
import { loadChunk, memoBinding } from "./loader";
import {
    asPageValue,
    type ModuleNamespace,
    type PageComponent,
    type PageContext,
    type PageElement,
    type PageNode,
} from "./types";

/** The page's own React. Two Reacts share no hooks or context. */
export interface PageReact {
    readonly version: string;
    readonly createElement: <Props>(
        type: PageComponent<Props> | string,
        props?: Props | null,
        ...children: readonly PageNode[]
    ) => PageElement;
    readonly cloneElement: (
        element: PageElement,
        props?: Readonly<Record<string, unknown>> | null,
    ) => PageElement;
    readonly Fragment: PageComponent<{ readonly children?: PageNode }>;
    readonly useState: <State>(
        initial: State | (() => State),
    ) => readonly [State, (next: State | ((previous: State) => State)) => void];
    readonly useEffect: (
        // Return a cleanup function, or nothing at all.
        effect: () => unknown,
        deps?: readonly unknown[],
    ) => void;
    readonly useMemo: <Value>(
        factory: () => Value,
        deps: readonly unknown[],
    ) => Value;
    readonly useCallback: <Fn>(callback: Fn, deps: readonly unknown[]) => Fn;
    readonly useRef: <Value>(initial: Value) => { current: Value };
    readonly useContext: <Value>(context: PageContext<Value>) => Value;
    /**
     * Shallow prop compare. The album table owns every row's staged edit, so
     * without this one keystroke re-renders a hundred react-selects.
     */
    readonly memo: <Props>(
        component: PageComponent<Props>,
    ) => PageComponent<Props>;
}

/** A mounted root from the page's `react-dom/client`. */
export interface PageRoot {
    readonly render: (element: PageElement) => void;
    readonly unmount: () => void;
}

/** The page's `react-dom/client`: roots, not portals. */
export interface PageReactDomClient {
    readonly createRoot: (container: Element | DocumentFragment) => PageRoot;
    readonly hydrateRoot: (
        container: Element,
        element: PageElement,
    ) => PageRoot;
}

/** The page's `react-dom`: portals and `flushSync`. */
export interface PageReactDom {
    readonly version: string;
    readonly createPortal: (
        children: PageNode,
        container: Element | DocumentFragment,
    ) => PageElement;
    readonly flushSync: <Value>(action: () => Value) => Value;
}

/** The page's `react/jsx-runtime`, what our JSX compiles against. */
export interface PageJsxRuntime {
    readonly jsx: <Props>(
        type: PageComponent<Props> | string,
        props: Props,
        key?: string,
    ) => PageElement;
    readonly jsxs: <Props>(
        type: PageComponent<Props> | string,
        props: Props,
        key?: string,
    ) => PageElement;
    readonly Fragment: PageComponent<{ readonly children?: PageNode }>;
}

/** React, react-dom, and the jsx runtime share one manual chunk. */
const loadVendor = (): Promise<AppResult<ModuleNamespace>> =>
    loadChunk("react-vendor");

const REACT_KEYS = [
    "createElement",
    "cloneElement",
    "Fragment",
    "useState",
    "useEffect",
    "useMemo",
    "useCallback",
    "useRef",
    "useContext",
    "memo",
] as const;

const complete = <T>(
    value: unknown,
    target: string,
    keys: readonly string[],
): AppResult<T> => {
    const missing = missingKeys(value, keys);

    if (missing.length > 0) {
        return Result.err({
            kind: "binding",
            target,
            reason: `found the module but it is missing ${missing.join(", ")}`,
        });
    }

    return Result.ok(asPageValue<T>(value));
};

/**
 * The page's own React instance (cached).
 * @returns The module, or a `binding` error if the chunk moved.
 */
export const getReact = memoBinding(async (): Promise<AppResult<PageReact>> => {
    const vendor = await loadVendor();

    if (vendor.isErr()) {
        return vendor;
    }

    // Only the Rollup interop re-export carries a `default` key.
    const found = findByKeys(
        vendor.value,
        "React",
        ["createElement", "useState", "version"],
        ["default"],
    );

    return found.isOk()
        ? complete<PageReact>(found.value, "React", REACT_KEYS)
        : found;
});

/**
 * The page's own `react-dom` (cached).
 * @returns The module, or a `binding` error if the chunk moved.
 */
export const getReactDom = memoBinding(
    async (): Promise<AppResult<PageReactDom>> => {
        const vendor = await loadVendor();

        if (vendor.isErr()) {
            return vendor;
        }

        const found = findByKeys(
            vendor.value,
            "react-dom",
            ["createPortal", "flushSync", "version"],
            ["default"],
        );

        return found.isOk()
            ? complete<PageReactDom>(found.value, "react-dom", [
                  "createPortal",
                  "flushSync",
              ])
            : found;
    },
);

/**
 * The page's own `react-dom/client` (cached).
 * @returns The module, or a `binding` error if the chunk moved.
 */
export const getReactDomClient = memoBinding(
    async (): Promise<AppResult<PageReactDomClient>> => {
        const vendor = await loadVendor();

        if (vendor.isErr()) {
            return vendor;
        }

        // react-dom also exports `createRoot`; the client entry stops there.
        const found = findByKeys(
            vendor.value,
            "react-dom/client",
            ["createRoot", "hydrateRoot"],
            ["createPortal", "default"],
        );

        return found.isOk()
            ? complete<PageReactDomClient>(found.value, "react-dom/client", [
                  "createRoot",
              ])
            : found;
    },
);

/**
 * The page's own `react/jsx-runtime` (cached).
 * @returns The module, or a `binding` error if the chunk moved.
 */
export const getJsxRuntime = memoBinding(
    async (): Promise<AppResult<PageJsxRuntime>> => {
        const vendor = await loadVendor();

        if (vendor.isErr()) {
            return vendor;
        }

        const found = findByKeys(
            vendor.value,
            "react/jsx-runtime",
            ["jsx", "jsxs", "Fragment"],
            ["createElement"],
        );

        return found.isOk()
            ? complete<PageJsxRuntime>(found.value, "react/jsx-runtime", [
                  "jsx",
                  "jsxs",
              ])
            : found;
    },
);

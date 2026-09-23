import { Result } from "@resulted/results";
import type * as React from "react";
import type { BindingError, ChunkError } from "./errors";
import { findByKeys, missingKeys } from "./finders";
import { type Binding, loadChunk, memoBinding } from "./loader";
import {
    asPageValue,
    type ModuleNamespace,
    type PageComponent,
    type PageElement,
    type PageNode,
} from "./types";

/**
 * The page's own React, in React's own types. Two Reacts share no hooks
 * or context, so this is only ever theirs.
 */
export type PageReact = typeof React;

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
const loadVendor = (): Promise<Result<ModuleNamespace, ChunkError>> =>
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
): Result<T, BindingError> => {
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
export const getReact: Binding<PageReact> = memoBinding(async () => {
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
export const getReactDom: Binding<PageReactDom> = memoBinding(async () => {
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
});

/**
 * The page's own `react-dom/client` (cached).
 * @returns The module, or a `binding` error if the chunk moved.
 */
export const getReactDomClient: Binding<PageReactDomClient> = memoBinding(
    async () => {
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
export const getJsxRuntime: Binding<PageJsxRuntime> = memoBinding(async () => {
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
});

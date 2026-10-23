import type { Result } from "@resulted/results";
import type * as React from "react";
import type { ReactElement, ReactNode } from "react";
import type { ChunkError } from "@/bindings/errors";
import { findByKeys } from "@/bindings/finders";
import { type Binding, loadChunk, memoBinding } from "@/bindings/loader";
import { borrowModule, type ModuleNamespace } from "@/bindings/types";

/**
 * The page's own React, in React's own types. Two Reacts share no hooks
 * or context, so this is only ever theirs.
 */
export type PageReact = typeof React;

/** A mounted root from the page's `react-dom/client`. */
export interface PageRoot {
    readonly render: (element: ReactElement) => void;
    readonly unmount: () => void;
}

/** The page's `react-dom/client`: roots, not portals. */
export interface PageReactDomClient {
    readonly createRoot: (container: Element | DocumentFragment) => PageRoot;
    readonly hydrateRoot: (
        container: Element,
        element: ReactElement,
    ) => PageRoot;
}

/** The page's `react-dom`: portals and `flushSync`. */
export interface PageReactDom {
    readonly version: string;
    readonly createPortal: (
        children: ReactNode,
        container: Element | DocumentFragment,
    ) => ReactElement;
    readonly flushSync: <Value>(action: () => Value) => Value;
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
        ? borrowModule<PageReact>(found.value, "React", REACT_KEYS)
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
        ? borrowModule<PageReactDom>(found.value, "react-dom", [
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
            ? borrowModule<PageReactDomClient>(
                  found.value,
                  "react-dom/client",
                  ["createRoot"],
              )
            : found;
    },
);

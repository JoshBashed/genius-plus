/** Genius's React, as the named imports any React file would use. */
import type { PageReact } from "@/bindings";
import { slot } from "@/content/genius/slot";

export const reactSlot = slot<PageReact>("React");

// Assigned by `bindReact` when the page's React is installed. Module
// bindings are live, so a file that imported these before then calls
// the page's own, under React's own types.
export let createElement: PageReact["createElement"];
export let cloneElement: PageReact["cloneElement"];
export let memo: PageReact["memo"];
export let useState: PageReact["useState"];
export let useEffect: PageReact["useEffect"];
export let useMemo: PageReact["useMemo"];
export let useCallback: PageReact["useCallback"];
export let useRef: PageReact["useRef"];
export let useContext: PageReact["useContext"];
export let Fragment: PageReact["Fragment"];

/** Points every export above at the page's React. */
export const bindReact = (react: PageReact): void => {
    createElement = react.createElement;
    cloneElement = react.cloneElement;
    memo = react.memo;
    useState = react.useState;
    useEffect = react.useEffect;
    useMemo = react.useMemo;
    useCallback = react.useCallback;
    useRef = react.useRef;
    useContext = react.useContext;
    Fragment = react.Fragment;
};

/**
 * What compiled JSX calls, built on their `createElement`.
 * `createElement` reads `key` out of props and keeps `children` there.
 */
export const jsx = (
    type: Parameters<PageReact["createElement"]>[0],
    props: Readonly<Record<string, unknown>>,
    key?: string,
): ReturnType<PageReact["createElement"]> =>
    createElement(type, key === undefined ? props : { ...props, key });

export const jsxs = jsx;
export const jsxDEV = jsx;

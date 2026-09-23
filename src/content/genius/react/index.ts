/** Genius's React, as the named imports any React file would use. */
import { asPageValue, type PageReact } from "@/bindings";
import { slot } from "../slot";

export const reactSlot = slot<PageReact>("React");

/** Binds the page's own React; everything below reads it at the call. */
export const setReact = reactSlot.set;

/** Whether the page's React has been bound at all. */
export const hasReact = (): boolean => reactSlot.peek() !== null;

/** Their function of that name, read from the slot when it is called. */
const late = <Key extends keyof PageReact>(key: Key): PageReact[Key] =>
    asPageValue<PageReact[Key]>((...args: readonly unknown[]) =>
        asPageValue<(...args: readonly unknown[]) => unknown>(
            reactSlot.get()[key],
        )(...args),
    );

export const createElement = late("createElement");
export const cloneElement = late("cloneElement");
export const memo = late("memo");
export const useState = late("useState");
export const useEffect = late("useEffect");
export const useMemo = late("useMemo");
export const useCallback = late("useCallback");
export const useRef = late("useRef");
export const useContext = late("useContext");

/** The registered symbol every React copy renders a fragment for. */
export const Fragment = asPageValue<PageReact["Fragment"]>(
    Symbol.for("react.fragment"),
);

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

/** The same, for code that would rather write `React.createElement`. */
const React = {
    cloneElement,
    createElement,
    Fragment,
    memo,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
};

export default React;

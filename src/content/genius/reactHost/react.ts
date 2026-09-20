/** Genius's React, as the named imports any React file would use. */
import type {
    PageComponent,
    PageElement,
    PageNode,
    PageReact,
} from "@/bindings";
import { slot } from "./binding";

export const reactSlot = slot<PageReact>("React");

/** Binds the page's own React; everything below reads it at the call. */
export const setReact = reactSlot.set;

/** Whether the page's React has been bound at all. */
export const hasReact = (): boolean => reactSlot.peek() !== null;

export const createElement: PageReact["createElement"] = (
    type,
    props,
    ...children
) => reactSlot.get().createElement(type, props, ...children);

export const cloneElement: PageReact["cloneElement"] = (element, props) =>
    reactSlot.get().cloneElement(element, props);

export const useState: PageReact["useState"] = (initial) =>
    reactSlot.get().useState(initial);

export const useEffect: PageReact["useEffect"] = (effect, deps) =>
    reactSlot.get().useEffect(effect, deps);

export const useMemo: PageReact["useMemo"] = (factory, deps) =>
    reactSlot.get().useMemo(factory, deps);

export const useCallback: PageReact["useCallback"] = (callback, deps) =>
    reactSlot.get().useCallback(callback, deps);

export const useRef: PageReact["useRef"] = (initial) =>
    reactSlot.get().useRef(initial);

export const useContext: PageReact["useContext"] = (context) =>
    reactSlot.get().useContext(context);

export const memo: PageReact["memo"] = (component) =>
    reactSlot.get().memo(component);

/**
 * Their `Fragment`, wrapped so it can be imported before it is bound.
 * JSX in this directory compiles to the registered symbol instead, so
 * this is only for a `Fragment` written by hand.
 */
export const Fragment = ((props: { readonly children?: PageNode }) =>
    createElement(reactSlot.get().Fragment, props)) as PageComponent<{
    readonly children?: PageNode;
}>;

export const version = (): string => reactSlot.get().version;

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
export type { PageElement };

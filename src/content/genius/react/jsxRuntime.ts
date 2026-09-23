/**
 * Genius's react runtime.
 */
import type { Result } from "@resulted/results";
import {
    type BindingError,
    type ChunkError,
    describeBindingError,
    getJsxRuntime,
    type PageElement,
    type PageJsxRuntime,
} from "@/bindings";

let runtime: PageJsxRuntime | null = null;

/**
 * Resolves the page's `react/jsx-runtime` (cached).
 * @returns A `Result` with the page's `PageJsxRuntime`.
 */
export const primeJsxRuntime = async (): Promise<
    Result<PageJsxRuntime, ChunkError>
> => {
    const found = await getJsxRuntime();

    if (found.isOk()) {
        runtime = found.value;
    }

    return found;
};

// Imported at content-script start, so the lookup lands in time.
void primeJsxRuntime();

/** @throws Always: a JSX expression cannot return a `Result`. */
const unresolved = (): never => {
    const error: BindingError = {
        kind: "binding",
        target: "react/jsx-runtime",
        reason: "JSX was evaluated before primeJsxRuntime() resolved",
    };

    throw new Error(describeBindingError(error));
};

export const jsx = (
    type: unknown,
    props: unknown,
    key?: string,
): PageElement =>
    runtime === null
        ? unresolved()
        : runtime.jsx(type as string, props as Record<string, unknown>, key);

export const jsxs = (
    type: unknown,
    props: unknown,
    key?: string,
): PageElement =>
    runtime === null
        ? unresolved()
        : runtime.jsxs(type as string, props as Record<string, unknown>, key);

/** Development builds emit `jsxDEV`; the extra arguments are debug only. */
export const jsxDEV = (
    type: unknown,
    props: unknown,
    key?: string,
): PageElement => jsx(type, props, key);

/** The registered symbol, shared across React copies. */
export const Fragment = Symbol.for("react.fragment");

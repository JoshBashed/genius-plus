/** Borrows the page's context values off the live fiber tree. */
import { Result } from "@resulted/results";
import {
    asPageValue,
    type BindingError,
    type GeniusTheme,
    type PageComponent,
    type PageContext,
    type PageElement,
    type PageNode,
} from "@/bindings";
import { createElement } from "./react";

const PROVIDER = Symbol.for("react.provider");
const CONTEXT = Symbol.for("react.context");

/** Only the four fields we walk; a fiber has dozens. */
interface Fiber {
    readonly child: Fiber | null;
    readonly sibling: Fiber | null;
    readonly type: unknown;
    readonly memoizedProps: unknown;
}

export interface CapturedContext {
    readonly context: PageContext<unknown>;
    readonly value: unknown;
}

/** Deep enough to clear the app shell, bounded so a big tree cannot hang. */
const NODE_BUDGET = 6000;

const objectLike = (value: unknown): value is Record<string, unknown> =>
    (typeof value === "object" && value !== null) ||
    typeof value === "function";

/** React 18 wraps a provider's type; React 19 does not. Accept both. */
const contextOf = (type: unknown): unknown => {
    if (!objectLike(type)) {
        return null;
    }

    if (type.$$typeof === PROVIDER) {
        return type._context ?? null;
    }

    return type.$$typeof === CONTEXT ? type : null;
};

/** Only the prefix is stable; the value is the host root fiber. */
const fiberOf = (container: Element): Fiber | null => {
    const key = Object.keys(container).find((name) =>
        name.startsWith("__reactContainer$"),
    );

    if (key === undefined) {
        return null;
    }

    const found = (container as unknown as Record<string, unknown>)[key];
    return objectLike(found) ? (found as unknown as Fiber) : null;
};

/** A page with no app root still has one, so the scan is bounded. */
const ELEMENT_BUDGET = 8000;

/**
 * Every React root in the document, app root first.
 *
 * The album page mounts one tree under `#application`. A page Genius
 * answers with a 404 has no app root at all, only the islands it renders
 * its own nav and footer with, and those carry the theme just the same.
 */
const rootFibers = (): readonly Fiber[] => {
    const roots: Fiber[] = [];
    const app = document.querySelector("#application");
    const appFiber = app === null ? null : fiberOf(app);

    if (appFiber !== null) {
        roots.push(appFiber);
    }

    const all = document.querySelectorAll("*");
    const limit = Math.min(all.length, ELEMENT_BUDGET);

    for (let index = 0; index < limit; index += 1) {
        const element = all[index];

        if (element === undefined || element === app) {
            continue;
        }

        const fiber = fiberOf(element);

        if (fiber !== null) {
            roots.push(fiber);
        }
    }

    return roots;
};

/** Breadth-first, so the first provider seen is the outermost one. */
export const capturePageContexts = (): readonly CapturedContext[] => {
    const roots = rootFibers();

    if (roots.length === 0) {
        return [];
    }

    const captured: CapturedContext[] = [];
    const seen = new Set<unknown>();
    const queue: Fiber[] = [...roots];
    let visited = 0;

    while (queue.length > 0 && visited < NODE_BUDGET) {
        const fiber = queue.shift();

        if (fiber === undefined) {
            break;
        }

        visited += 1;

        const context = contextOf(fiber.type);
        const props = fiber.memoizedProps;

        // A consumer's type is the context too; only `value` marks a
        // provider, and only a capture marks the context seen.
        if (
            context !== null &&
            !seen.has(context) &&
            objectLike(props) &&
            "value" in props
        ) {
            seen.add(context);
            captured.push({
                context: asPageValue<PageContext<unknown>>(context),
                value: props.value,
            });
        }

        if (fiber.child !== null) {
            queue.push(fiber.child);
        }

        if (fiber.sibling !== null) {
            queue.push(fiber.sibling);
        }
    }

    return captured;
};

const isTheme = (value: unknown): value is GeniusTheme => {
    if (!objectLike(value)) {
        return false;
    }

    const space = value.space;
    const color = value.color;

    return (
        objectLike(space) &&
        typeof space.half === "string" &&
        objectLike(color) &&
        typeof value.inputActive === "function"
    );
};

/** The live theme, so high-contrast and album colours come for free. */
export const pageTheme = (
    captured: readonly CapturedContext[],
    themeContext: PageContext<GeniusTheme | undefined>,
): Result<GeniusTheme, BindingError> => {
    const exact = captured.find((entry) => entry.context === themeContext);

    if (exact !== undefined && isTheme(exact.value)) {
        return Result.ok(exact.value);
    }

    // Context identity is the better key, but shape will do.
    const shaped = captured.find((entry) => isTheme(entry.value));

    if (shaped !== undefined && isTheme(shaped.value)) {
        return Result.ok(shaped.value);
    }

    return Result.err({
        kind: "binding",
        target: "the page's active theme",
        reason: `none of the ${captured.length} context providers on this page carry one`,
    });
};

interface ProviderProps {
    readonly value: unknown;
    readonly children?: PageNode;
}

const providerOf = (
    context: PageContext<unknown>,
): PageComponent<ProviderProps> =>
    asPageValue<PageComponent<ProviderProps>>(
        asPageValue<{ readonly Provider: unknown }>(context).Provider,
    );

/** Wraps `children` in every captured provider, outermost first. */
export const withPageContexts = (
    captured: readonly CapturedContext[],
    children: PageElement,
): PageElement => {
    let wrapped = children;

    // Innermost first, so the shallowest provider ends up outermost.
    for (const entry of [...captured].reverse()) {
        wrapped = createElement(
            providerOf(entry.context),
            { value: entry.value },
            wrapped,
        );
    }

    return wrapped;
};

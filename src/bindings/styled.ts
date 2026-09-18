import { Result } from "@resulted/results";
import type { AppResult } from "@/utilities/result";
import { findContext, readProperty, selectExport } from "./finders";
import { loadChunkMatching, memoBinding } from "./loader";
import {
    asPageValue,
    type PageComponent,
    type PageContext,
    type PageNode,
} from "./types";

/** Genius's styled-components, mainly `ThemeProvider` and `useTheme`. */

/** One substitution in a styled template: a literal, or a theme read. */
export type PageStyledValue =
    | string
    | number
    | ((props: { readonly theme: GeniusTheme }) => string | number);

/** A tagged template that builds one styled component. */
export type PageStyledTag = (
    strings: TemplateStringsArray,
    ...values: readonly PageStyledValue[]
) => PageComponent<Readonly<Record<string, unknown>>>;

/** `styled(Component)` and `styled.div`, from the page's own copy. */
export interface PageStyledFactory {
    /** The call form matters under `noUncheckedIndexedAccess`. */
    <Props>(component: PageComponent<Props> | string): PageStyledTag;
    readonly [tag: string]: PageStyledTag;
}

/** Only theme keys seen in chunk source; add one when you read it. */
export interface GeniusTheme {
    readonly deviceType: "mobile" | "desktop";
    readonly borderRadius: string;
    readonly color: {
        readonly background: {
            readonly main: string;
            readonly on: string;
            readonly variant: string;
            readonly onVariant: string;
            readonly onSecondary: string;
        };
        readonly accent: { readonly main: string };
        readonly brandAccent: { readonly main: string; readonly on: string };
        readonly success: { readonly main: string };
        readonly border: { readonly adaptive: string };
    };
    readonly space: {
        readonly hair: string;
        readonly quarter: string;
        readonly xSmall: string;
        readonly half: string;
        readonly small: string;
        readonly full: string;
        readonly large: string;
        readonly xxLarge: string;
        readonly [key: string]: string;
    };
    readonly fontSize: {
        readonly xSmallReading: string;
        readonly smallReading: string;
        readonly reading: string;
        readonly mediumReading: string;
        readonly smallHeadline: string;
        readonly [key: string]: string;
    };
    readonly fontWeight: {
        readonly light: string;
        readonly normal: string;
        readonly [key: string]: string;
    };
    readonly font: { readonly reading: string; readonly [key: string]: string };
    readonly lineHeight: {
        readonly xShort: string;
        readonly short: string;
        readonly reading: string;
        readonly normal: string;
        readonly [key: string]: string;
    };
    /** Called as `theme.inputActive("css")` in their input styles. */
    readonly inputActive: (mode: string) => unknown;
}

/** Their `ThemeProvider` props; `theme` may derive from the outer one. */
export interface ThemeProviderProps {
    readonly theme: GeniusTheme | ((outer: GeniusTheme) => GeniusTheme);
    readonly children?: PageNode;
}

/** The slice of styled-components' exports this extension uses. */
export interface PageStyledComponents {
    readonly styled: PageStyledFactory;
    readonly css: (
        strings: TemplateStringsArray,
        ...values: readonly unknown[]
    ) => readonly unknown[];
    readonly keyframes: (
        strings: TemplateStringsArray,
        ...values: readonly unknown[]
    ) => unknown;
    readonly ThemeProvider: PageComponent<ThemeProviderProps>;
    readonly ThemeContext: PageContext<GeniusTheme | undefined>;
    /** Returns `undefined` outside a `ThemeProvider`. */
    readonly useTheme: () => GeniusTheme | undefined;
}

const sourceOf = (value: unknown): string => {
    if (typeof value !== "function") {
        return "";
    }

    const text = Result.trySync(() => Function.prototype.toString.call(value));
    return text.isOk() ? text.value : "";
};

const CHUNK = /^styled-components(\b|[.-])/;

/**
 * Vendored, so its base name moves more readily than a component's.
 * @returns The exports we use, or a `binding` error naming the miss.
 */
export const getStyledComponents = memoBinding(
    async (): Promise<AppResult<PageStyledComponents>> => {
        const chunk = await loadChunkMatching(CHUNK, "styled-components");

        if (chunk.isErr()) {
            return chunk;
        }

        const ns = chunk.value;

        // The only callable export with a tag helper per DOM element.
        const styled = selectExport(
            ns,
            "styled",
            (value) =>
                typeof value === "function" &&
                typeof readProperty(value, "div") === "function" &&
                typeof readProperty(value, "span") === "function",
        );

        const themeContext = findContext(ns, "ThemeContext");

        // The remaining four are separable only by their minified bodies.
        const themeProvider = selectExport(ns, "ThemeProvider", (value) => {
            const source = sourceOf(value);
            return (
                source.includes("useContext") &&
                source.includes("useMemo") &&
                !source.includes("forwardRef")
            );
        });

        const useTheme = selectExport(
            ns,
            "useTheme",
            (value) =>
                typeof value === "function" &&
                value.length === 0 &&
                sourceOf(value).includes("useContext"),
        );

        // Same preamble: `keyframes` joins the result,
        // `createGlobalStyle` hashes it, and `css` does neither.
        const keyframes = selectExport(ns, "keyframes", (value) => {
            const source = sourceOf(value);
            return (
                source.includes("arguments.length") &&
                source.includes('.join("")') &&
                !source.includes("sc-global-")
            );
        });

        const css = selectExport(ns, "css", (value) => {
            const source = sourceOf(value);
            return (
                source.includes("arguments.length") &&
                !source.includes('.join("")') &&
                !source.includes("sc-global-")
            );
        });

        if (styled.isErr()) {
            return styled;
        }
        if (themeContext.isErr()) {
            return themeContext;
        }
        if (themeProvider.isErr()) {
            return themeProvider;
        }
        if (useTheme.isErr()) {
            return useTheme;
        }
        if (keyframes.isErr()) {
            return keyframes;
        }
        if (css.isErr()) {
            return css;
        }

        return Result.ok({
            styled: asPageValue<PageStyledFactory>(styled.value),
            css: asPageValue<PageStyledComponents["css"]>(css.value),
            keyframes: asPageValue<PageStyledComponents["keyframes"]>(
                keyframes.value,
            ),
            ThemeProvider: asPageValue<PageComponent<ThemeProviderProps>>(
                themeProvider.value,
            ),
            ThemeContext: asPageValue<PageContext<GeniusTheme | undefined>>(
                themeContext.value,
            ),
            useTheme: asPageValue<() => GeniusTheme | undefined>(
                useTheme.value,
            ),
        });
    },
);

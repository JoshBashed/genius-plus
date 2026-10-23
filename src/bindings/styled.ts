import { Result } from "@resulted/results";
import type {
    ComponentProps,
    Context,
    ElementType,
    FC,
    ReactNode,
} from "react";
import { findContext, readProperty, selectExport } from "@/bindings/finders";
import {
    type Binding,
    loadChunkMatching,
    memoBinding,
} from "@/bindings/loader";
import {
    borrowComponent,
    borrowContext,
    borrowFunction,
} from "@/bindings/types";

/** Genius's styled-components: `styled`, `ThemeProvider`, and `ThemeContext`. */

/** One substitution in a styled template: a literal, or a theme read. */
export type PageStyledValue =
    | string
    | number
    | ((props: { readonly theme: GeniusTheme }) => string | number);

/** A tagged template that builds a component taking the target's props. */
export type PageStyledTag<Props> = (
    strings: TemplateStringsArray,
    ...values: readonly PageStyledValue[]
) => FC<Props & { readonly className?: string; readonly children?: ReactNode }>;

/** `styled("div")` or `styled(Component)`, from the page's own copy. */
export type PageStyledFactory = <Target extends ElementType>(
    target: Target,
) => PageStyledTag<ComponentProps<Target>>;

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
    readonly children?: ReactNode;
}

/** The slice of styled-components' exports this extension uses. */
export interface PageStyledComponents {
    readonly styled: PageStyledFactory;
    readonly ThemeProvider: FC<ThemeProviderProps>;
    readonly ThemeContext: Context<GeniusTheme | undefined>;
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
export const getStyledComponents: Binding<PageStyledComponents> = memoBinding(
    async () => {
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

        // Separable from the other exports only by its minified body.
        const themeProvider = selectExport(ns, "ThemeProvider", (value) => {
            const source = sourceOf(value);
            return (
                source.includes("useContext") &&
                source.includes("useMemo") &&
                !source.includes("forwardRef")
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

        const factory = borrowFunction<PageStyledFactory>(
            styled.value,
            "styled",
        );
        const provider = borrowComponent<ThemeProviderProps>(
            themeProvider.value,
            "ThemeProvider",
        );
        const context = borrowContext<GeniusTheme | undefined>(
            themeContext.value,
            "ThemeContext",
        );

        if (factory.isErr()) {
            return factory;
        }
        if (provider.isErr()) {
            return provider;
        }
        if (context.isErr()) {
            return context;
        }

        return Result.ok({
            styled: factory.value,
            ThemeContext: context.value,
            ThemeProvider: provider.value,
        });
    },
);

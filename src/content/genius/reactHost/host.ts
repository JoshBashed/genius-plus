/** Genius's React, styled-components, theme, and borrowed components. */
import type {
    ButtonProps,
    DateInputProps,
    DropdownProps,
    GeniusTheme,
    PageComponent,
    PageReact,
    PageStyledFactory,
    SelectInputProps,
    SmallButtonProps,
    SpinnerProps,
    TagInputProps,
    TextInputProps,
} from "@/bindings";
import { type AppError, describeError } from "@/utilities/result";

/** Everything the album table renders with, all borrowed from the page. */
export interface ReactHost {
    readonly react: PageReact;
    readonly styled: PageStyledFactory;
    /** Captured off the live fiber tree, not read through a hook. */
    readonly theme: GeniusTheme;
    readonly Button: PageComponent<ButtonProps>;
    readonly DateInput: PageComponent<DateInputProps>;
    /** `null` when its chunk moved: the header menus go, the table stays. */
    readonly Dropdown: PageComponent<DropdownProps> | null;
    readonly SelectInput: PageComponent<SelectInputProps>;
    readonly SmallButton: PageComponent<SmallButtonProps>;
    readonly Spinner: PageComponent<SpinnerProps>;
    readonly TagInput: PageComponent<TagInputProps>;
    readonly TextInput: PageComponent<TextInputProps>;
}

/** What an early read names, so the throw says which lookup is missing. */
const TARGETS: Readonly<Record<keyof ReactHost, string>> = {
    react: "React",
    styled: "styled-components",
    theme: "the page's active theme",
    Button: "Genius's Button",
    DateInput: "Genius's DateInput",
    Dropdown: "Genius's Dropdown",
    SelectInput: "Genius's SelectInput",
    SmallButton: "Genius's SmallButton",
    Spinner: "Genius's Spinner",
    TagInput: "Genius's TagInput",
    TextInput: "Genius's TextInput",
};

let primed: ReactHost | null = null;

/** Publishes the bindings `mount` resolved, before the table is imported. */
export const primeReactHost = (bindings: ReactHost): void => {
    primed = bindings;
};

/** @throws Always: a module body cannot return a `Result`. */
const unresolved = (target: string): never => {
    const error: AppError = {
        kind: "binding",
        target,
        reason: "the album table was evaluated before primeReactHost() ran",
    };

    throw new Error(describeError(error));
};

const bound = <Key extends keyof ReactHost>(key: Key): ReactHost[Key] =>
    primed === null ? unresolved(TARGETS[key]) : primed[key];

/** The primed bindings; every read throws until `primeReactHost` runs. */
export const host: ReactHost = {
    get react() {
        return bound("react");
    },
    get styled() {
        return bound("styled");
    },
    get theme() {
        return bound("theme");
    },
    get Button() {
        return bound("Button");
    },
    get DateInput() {
        return bound("DateInput");
    },
    get Dropdown() {
        return bound("Dropdown");
    },
    get SelectInput() {
        return bound("SelectInput");
    },
    get SmallButton() {
        return bound("SmallButton");
    },
    get Spinner() {
        return bound("Spinner");
    },
    get TagInput() {
        return bound("TagInput");
    },
    get TextInput() {
        return bound("TextInput");
    },
};

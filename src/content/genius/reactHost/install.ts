/** Filling the slots. Every entry point starts here, album page or not. */

import {
    type GeniusTheme,
    getButton,
    getDateInput,
    getDropdown,
    getReact,
    getReactDomClient,
    getSelectInput,
    getSmallButton,
    getSpinner,
    getStyledComponents,
    getTagInput,
    getTextInput,
    getUseLanguageOptions,
    getUsePusher,
    type PageReactDomClient,
    type PageStyledComponents,
} from "@/bindings";
import type { AppResult } from "@/utilities/result";
import {
    setButton,
    setDateInput,
    setDropdown,
    setSelectInput,
    setSmallButton,
    setSpinner,
    setStyled,
    setTagInput,
    setTextInput,
    setTheme,
} from "../geniusComponents";
import { setUseLanguageOptions, setUsePusher } from "../geniusHooks";
import {
    type CapturedContext,
    capturePageContexts,
    pageTheme,
} from "../pageContext";
import { installAll, installOptional, installs } from "./binding";
import { primeJsxRuntime } from "./jsxRuntime";
import { setReact } from "./react";

/** What a page still has to hold, because it renders with it directly. */
export interface Runtime {
    readonly dom: PageReactDomClient;
    readonly styled: PageStyledComponents;
    readonly theme: GeniusTheme;
    /** The providers the page's own tree is under, captured once. */
    readonly contexts: readonly CapturedContext[];
}

/**
 * React, its JSX runtime, styled-components, and the live theme.
 *
 * Nothing renders before these, so every entry point awaits it first,
 * and none of them has a reason to know how it is done.
 */
export const installRuntime = async (): Promise<AppResult<Runtime>> => {
    const react = await installAll([installs(getReact, setReact)]);

    if (react.isErr()) {
        return react;
    }

    // Every JSX expression in these bundles reads this synchronously.
    const jsxRuntime = await primeJsxRuntime();

    if (jsxRuntime.isErr()) {
        return jsxRuntime;
    }

    const dom = await getReactDomClient();

    if (dom.isErr()) {
        return dom;
    }

    // Its namespace is needed whole: the theme comes off its context and
    // a tree is wrapped in its provider.
    const styled = await getStyledComponents();

    if (styled.isErr()) {
        return styled;
    }

    setStyled(styled.value.styled);

    const contexts = capturePageContexts();
    const theme = pageTheme(contexts, styled.value.ThemeContext);

    if (theme.isErr()) {
        return theme;
    }

    setTheme(theme.value);

    return theme.map((value) => ({
        contexts,
        dom: dom.value,
        styled: styled.value,
        theme: value,
    }));
};

/** Every borrowed input, so a page installs only what it renders with. */
const COMPONENTS = {
    button: installs(getButton, setButton),
    dateInput: installs(getDateInput, setDateInput),
    selectInput: installs(getSelectInput, setSelectInput),
    smallButton: installs(getSmallButton, setSmallButton),
    spinner: installs(getSpinner, setSpinner),
    tagInput: installs(getTagInput, setTagInput),
    textInput: installs(getTextInput, setTextInput),
} as const;

export type ComponentName = keyof typeof COMPONENTS;

/**
 * Installs the named components and nothing else.
 * A page asks for what it renders: the ones it leaves out may not be on
 * it at all, and reading one throws rather than painting wrong.
 */
export const installComponents = (
    names: readonly ComponentName[],
): Promise<AppResult<null>> =>
    installAll(names.map((name) => COMPONENTS[name]));

/**
 * The ones a page still works without.
 * Missing, the header menus go, a queued write is never confirmed, and
 * the language column loses its choices. None of that stops a mount.
 */
export const installExtras = (): Promise<void> =>
    installOptional([
        installs(getDropdown, setDropdown),
        installs(getUsePusher, setUsePusher),
        installs(getUseLanguageOptions, setUseLanguageOptions),
    ]);

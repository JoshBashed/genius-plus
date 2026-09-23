/** Filling the slots. Every entry point starts here, album page or not. */

import type { Result } from "@resulted/results";
import {
    type ChunkError,
    type GeniusTheme,
    getAlertIcon,
    getButton,
    getCheckbox,
    getCheckIcon,
    getDateInput,
    getDropdown,
    getPlusIcon,
    getReact,
    getReactDomClient,
    getSelectInput,
    getSmallButton,
    getSpinner,
    getStyledComponents,
    getTagInput,
    getTextInput,
    getUseGoogleReCaptcha,
    getUsePusher,
    getUseTranslation,
    getWarningIcon,
    type PageReactDomClient,
    type PageStyledComponents,
} from "@/bindings";
import {
    alertIconSlot,
    buttonSlot,
    checkboxSlot,
    checkIconSlot,
    dateInputSlot,
    dropdownSlot,
    plusIconSlot,
    selectInputSlot,
    setStyled,
    setTheme,
    smallButtonSlot,
    spinnerSlot,
    tagInputSlot,
    textInputSlot,
    warningIconSlot,
} from "./geniusComponents";
import {
    useGoogleReCaptchaSlot,
    usePusherSlot,
    useTranslationSlot,
} from "./geniusHooks";
import {
    type CapturedContext,
    capturePageContexts,
    pageTheme,
} from "./pageContext";
import { reactSlot } from "./react";
import { primeJsxRuntime } from "./react/jsxRuntime";
import { installAll, installOptional, installs } from "./slot";

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
export const installRuntime = async (): Promise<
    Result<Runtime, ChunkError>
> => {
    const react = await installAll([installs(getReact, reactSlot)]);

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
    button: installs(getButton, buttonSlot),
    checkbox: installs(getCheckbox, checkboxSlot),
    dateInput: installs(getDateInput, dateInputSlot),
    selectInput: installs(getSelectInput, selectInputSlot),
    smallButton: installs(getSmallButton, smallButtonSlot),
    spinner: installs(getSpinner, spinnerSlot),
    tagInput: installs(getTagInput, tagInputSlot),
    textInput: installs(getTextInput, textInputSlot),
} as const;

export type ComponentName = keyof typeof COMPONENTS;

/**
 * Installs the named components and nothing else.
 * A page asks for what it renders: the ones it leaves out may not be on
 * it at all, and reading one throws rather than painting wrong.
 */
export const installComponents = (
    names: readonly ComponentName[],
): Promise<Result<null, ChunkError>> =>
    installAll(names.map((name) => COMPONENTS[name]));

/**
 * The ones a page still works without.
 * Missing, the header menus go, a queued write is never confirmed, and
 * the language column loses its choices. None of that stops a mount.
 */
export const installExtras = (): Promise<void> =>
    installOptional([
        installs(getDropdown, dropdownSlot),
        installs(getUsePusher, usePusherSlot),
        installs(getUseTranslation, useTranslationSlot),
        installs(getUseGoogleReCaptcha, useGoogleReCaptchaSlot),
        installs(getPlusIcon, plusIconSlot),
        installs(getWarningIcon, warningIconSlot),
        installs(getAlertIcon, alertIconSlot),
        installs(getCheckIcon, checkIconSlot),
    ]);

/**
 * Everything, in one pass, for whatever page we are on.
 *
 * A loader asks for nothing: what a page carries decides what binds, and
 * a component whose chunk is not here simply stays empty until something
 * renders it, which throws naming it. That beats every page keeping its
 * own list of what it thinks it needs.
 */
export const installEverything = async (): Promise<
    Result<Runtime, ChunkError>
> => {
    const runtime = await installRuntime();

    if (runtime.isErr()) {
        return runtime;
    }

    // Best effort: a page that lacks one of these still mounts, and the
    // slot says so at the point something reaches for it.
    await installOptional(Object.values(COMPONENTS));
    await installExtras();

    return runtime;
};

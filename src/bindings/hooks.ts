import { Result } from "@resulted/results";
import { findHook, selectExport } from "./finders";
import { type Binding, loadChunk, memoBinding } from "./loader";
import type { GeniusTheme } from "./styled";
import { asPageValue, type PageNode } from "./types";

/** Borrowed hooks; callable only inside the page's own React tree. */
const bindHook = <Fn>(chunk: string): Binding<Fn> =>
    memoBinding(async () => {
        const ns = await loadChunk(chunk);

        if (ns.isErr()) {
            return ns;
        }

        const found = findHook(ns.value, chunk);

        if (found.isErr()) {
            return found;
        }

        return Result.ok(asPageValue<Fn>(found.value));
    });

/** Borrowed hooks; callable only inside the page's own React tree. */
const bindWith = <Fn>(
    chunk: string,
    target: string,
    predicate: (value: unknown) => boolean,
): Binding<Fn> =>
    memoBinding(async () => {
        const ns = await loadChunk(chunk);

        if (ns.isErr()) {
            return ns;
        }

        const found = selectExport(ns.value, target, predicate);

        return found.isErr() ? found : Result.ok(asPageValue<Fn>(found.value));
    });

/** Options `useEntityForm` destructures; names read from the chunk. */
export interface UseEntityFormOptions {
    /** Redux thunk, or an RTK Query mutation when `isMutation`. */
    readonly submitAction: (payload: unknown, handlers?: unknown) => unknown;
    readonly extraValues?: Readonly<Record<string, unknown>>;
    /** Treats `submitAction` as an RTK Query trigger and `.unwrap()`s it. */
    readonly isMutation?: boolean;
    readonly onlySubmitChangedFields?: boolean;
    readonly transformPayload?: (payload: unknown, values: unknown) => unknown;
    readonly transformResponseOnReset?: (response: unknown) => unknown;
    /** Maps server error keys onto form field names. */
    readonly serverErrorFieldMapping?: Readonly<Record<string, string>>;
    /** Forwarded to react-hook-form's `useForm`. */
    readonly useFormOptions?: Readonly<Record<string, unknown>>;
    readonly resetOnSuccess?: boolean;
    readonly trackFieldEventsOnSuccess?: (
        ...args: readonly unknown[]
    ) => unknown;
    readonly onSubmit?: (values: unknown) => void;
    readonly onSuccess?: (
        response: unknown,
        values: unknown,
        payload?: unknown,
    ) => void;
    readonly onError?: (errors: unknown) => void;
    readonly onNotify?: (errors: unknown) => void;
    readonly focusFirstFieldOnError?: boolean;
}

/** What `useEntityForm` hands back to a form component. */
export interface UseEntityFormResult {
    /** react-hook-form's `useForm` return value, untyped here. */
    readonly methods: Readonly<Record<string, unknown>>;
    readonly onSubmit: (event: unknown) => void;
    readonly isSubmitting: boolean;
    /** True once any field is dirty. */
    readonly isNotClean: boolean;
}

/** What `useGoogleReCaptcha` hands back to a component. */
export interface UseGoogleReCaptchaResult {
    readonly initRecaptcha: () => void;
    readonly executeRecaptcha: (action: string) => Promise<string>;
}

/**
 * Their form controller: react-hook-form plus submission and errors.
 * @returns The hook, or a `binding` error if the chunk moved.
 */
export const getUseEntityForm =
    bindHook<(options: UseEntityFormOptions) => UseEntityFormResult>(
        "useEntityForm",
    );

/** What `useFormValidationState` reports about a form's errors. */
export interface FormValidationState {
    readonly hasErrors: boolean;
    /** Excludes errors whose `type` is `"server"`. */
    readonly hasFormValidationErrors: boolean;
}

/**
 * Shares its chunk with `isEmpty`; the hook is the arrow function.
 * @returns The hook, or a `binding` error if the chunk moved.
 */
export const getUseFormValidationState = bindHook<
    (args: { readonly control: unknown }) => FormValidationState
>("useFormValidationState");

/**
 * Genius's own wrapper over the styled-components `ThemeContext`.
 * @returns The hook, or a `binding` error if the chunk moved.
 */
export const getUseTheme = bindHook<() => GeniusTheme | undefined>("useTheme");

/**
 * Genius's own Google ReCaptcha hook, which needs no key and no auth of ours.
 */
export const getUseGoogleReCaptcha = bindWith<() => UseGoogleReCaptchaResult>(
    "useGoogleReCaptcha",
    "useGoogleReCaptcha",
    (value) => {
        if (typeof value !== "function") return false;

        const source = Result.trySync(() =>
            Function.prototype.toString.call(value),
        );

        return source.isOk() && source.value.includes("executeRecaptcha");
    },
);

/** Options the toast action accepts alongside its message. */
export interface ToastOptions {
    readonly timeout?: number;
    readonly persist?: boolean;
    readonly richText?: boolean;
}

/**
 * Dispatches a toast rather than showing one; statuses are unverified.
 * @returns The hook, or a `binding` error if the chunk moved.
 */
export const getUseToast =
    bindHook<
        (
            status: string,
            message: PageNode,
            options?: ToastOptions,
        ) => () => void
    >("useToast");

/** The signed-in user out of the redux store, or `undefined`. */
export interface CurrentUser {
    readonly id: number;
    readonly name?: string;
    readonly login?: string;
    readonly url?: string;
    readonly [key: string]: unknown;
}

/**
 * The signed-in user, or `undefined` when nobody is.
 * @returns The hook, or a `binding` error if the chunk moved.
 */
export const getUseCurrentUser =
    bindHook<() => CurrentUser | undefined>("useCurrentUser");

/** What `useTranslation` hands back; only the instance is ever read. */
export interface UseTranslationResult {
    /** An i18next instance, whose store is read through a schema. */
    readonly i18n: unknown;
}

/**
 * react-i18next's own hook, which their bundle re-exports.
 *
 * Read from `useMixpanelEvent`, which every React page preloads, rather
 * than from `useLanguageOptions`, which only song pages do. Their own
 * language list is five lines over the store this hands back, and those
 * five lines beat a chunk that half our pages do not carry.
 *
 * @returns The hook, or a `binding` error if the chunk moved.
 */
export const getUseTranslation = bindWith<() => UseTranslationResult>(
    "useMixpanelEvent",
    "useTranslation",
    (value) => {
        if (typeof value !== "function") return false;

        const source = Result.trySync(() =>
            Function.prototype.toString.call(value),
        );

        return source.isOk() && source.value.includes("reportNamespaces");
    },
);

/** What `usePusher` destructures; it builds the connection itself. */
export interface UsePusherOptions {
    readonly channelName: string;
    readonly eventName: string;
    /** Must be stable: it is one of the effect's dependencies. */
    readonly callback: (payload: unknown) => void;
    readonly disabled?: boolean;
    /** `false` leaves the payload's own snake_case keys alone. */
    readonly camelize?: boolean;
}

/** One channel and event, bound for as long as the caller is mounted. */
export type UsePusherHook = (options: UsePusherOptions) => void;

/**
 * Their Pusher subscription hook, which needs no key and no auth of ours.
 * @returns The hook, or a `binding` error if the chunk moved.
 */
export const getUsePusher = bindHook<UsePusherHook>("usePusher");

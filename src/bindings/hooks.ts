import { Result } from "@resulted/results";
import type { AppResult } from "@/utilities/result";
import type { SelectOption } from "./components";
import { findHook } from "./finders";
import { loadChunk, memoBinding } from "./loader";
import type { GeniusTheme } from "./styled";
import { asPageValue, type PageNode } from "./types";

/** Borrowed hooks; callable only inside the page's own React tree. */
const bindHook = <Fn>(chunk: string): (() => Promise<AppResult<Fn>>) =>
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

/**
 * Every language Genius accepts, read from the i18next store.
 * @returns The hook, or a `binding` error if the chunk moved.
 */
export const getUseLanguageOptions =
    bindHook<() => readonly SelectOption[]>("useLanguageOptions");

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

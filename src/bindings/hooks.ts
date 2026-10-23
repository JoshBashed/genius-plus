import { Result } from "@resulted/results";
import { findHook, selectExport } from "@/bindings/finders";
import { type Binding, loadChunk, memoBinding } from "@/bindings/loader";
import { asPageValue } from "@/bindings/types";

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

/** What `useGoogleReCaptcha` hands back to a component. */
export interface UseGoogleReCaptchaResult {
    readonly initRecaptcha: () => void;
    readonly executeRecaptcha: (action: string) => Promise<string>;
}

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

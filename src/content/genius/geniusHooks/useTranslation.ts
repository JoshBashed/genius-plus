/** react-i18next's own hook, as Genius's bundle re-exports it. */
import type { UseTranslationResult } from "@/bindings";
import { slot } from "../slot";

/** Exported whole so an install can record why a lookup failed. */
export const useTranslationSlot = slot<() => UseTranslationResult>(
    "Genius's useTranslation",
);

export const setUseTranslation = useTranslationSlot.set;

/** Their translation hook, which needs no key and no auth of ours. */
export const useTranslation = (): UseTranslationResult =>
    useTranslationSlot.get()();

/**
 * Their i18next instance, or `null` when nothing bound the hook.
 * @returns The instance unparsed; every reader has its own schema.
 */
export const usePageI18n = (): unknown => {
    const bound = useTranslationSlot.peek();

    return bound === null ? null : bound().i18n;
};

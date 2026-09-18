/** Every language Genius accepts, read from their i18next store. */
import type { SelectOption } from "@/bindings";
import { slot } from "../reactHost/binding";

const hook = slot<() => readonly SelectOption[]>("Genius's useLanguageOptions");

export const setUseLanguageOptions = hook.set;

/**
 * Their language list.
 * @returns An empty list when nothing bound it: a missing list costs
 * that column its choices, and nothing else.
 */
export const useLanguageOptions = (): readonly SelectOption[] => {
    const bound = hook.peek();

    return bound === null ? [] : bound();
};

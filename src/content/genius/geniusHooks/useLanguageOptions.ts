/** Every language Genius accepts, read from their own i18next store. */
import { z } from "zod";
import type { SelectOption } from "@/bindings";
import { decodeOr } from "@/utilities/decode";
import { usePageI18n } from "./useTranslation";

/**
 * The path their own hook reads: `store.data.<language>.translation`.
 * Only the language table is named, because nothing else is wanted.
 */
const i18nSchema = z.object({
    language: z.string(),
    store: z.object({
        data: z.record(
            z.string(),
            z.object({
                translation: z
                    .object({
                        languages: z.record(z.string(), z.string()).nullish(),
                    })
                    .nullish(),
            }),
        ),
    }),
});

/**
 * Their language list, as their own `useLanguageOptions` builds it.
 * @returns An empty list when the page carries no translations: a
 * missing list costs that column its choices, and nothing else.
 */
export const useLanguageOptions = (): readonly SelectOption[] => {
    const parsed = decodeOr(i18nSchema, usePageI18n());

    if (parsed === null) {
        return [];
    }

    const table =
        parsed.store.data[parsed.language]?.translation?.languages ?? {};

    return Object.entries(table).map(([value, label]) => ({ label, value }));
};

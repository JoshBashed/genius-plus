/** The config Genius renders into the page, under either spelling. */
import { isRecord } from "@/utilities/record";

/** The raw globals are snake_case; the camel spelling is post-merge. */
const sources = (): readonly Readonly<Record<string, unknown>>[] => {
    const state: unknown = Reflect.get(window, "__PRELOADED_STATE__");
    const app: unknown = Reflect.get(window, "__APP_CONFIG__");

    return [isRecord(state) ? state.config : null, app].filter(isRecord);
};

/**
 * One string off the page's config, under any of the names given.
 * @param names The camelCase spelling first, then the snake_case one.
 * @returns The first non-empty value found, or `null`.
 */
export const configString = (...names: readonly string[]): string | null => {
    for (const source of sources()) {
        for (const name of names) {
            const value = source[name];

            if (typeof value === "string" && value !== "") {
                return value;
            }
        }
    }

    return null;
};

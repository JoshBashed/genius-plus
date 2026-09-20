/** The config Genius renders into the page, under either spelling. */

/** The raw globals are snake_case; the camel spelling is post-merge. */
const sources = (): readonly Record<string, unknown>[] => {
    const globals = window as {
        __APP_CONFIG__?: unknown;
        __PRELOADED_STATE__?: { config?: unknown };
    };

    return [globals.__PRELOADED_STATE__?.config, globals.__APP_CONFIG__].filter(
        (source): source is Record<string, unknown> =>
            typeof source === "object" && source !== null,
    );
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

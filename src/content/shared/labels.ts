/** How far up the tree to look for a title next to some artwork. */
const MAX_DEPTH = 6;

const textOf = (node: Element | null): string | null => {
    const text = node?.textContent?.trim().replace(/\s+/g, " ") ?? "";
    return text === "" ? null : text;
};

/**
 * The nearest title above `element`, searched inside out.
 * @param selectors Title candidates, tried in order at each level.
 * @returns The collapsed text, or `null` within six ancestors.
 */
export const nearestText = (
    element: HTMLElement,
    selectors: readonly string[],
): string | null => {
    let node: HTMLElement | null = element;

    for (let depth = 0; node !== null && depth < MAX_DEPTH; depth += 1) {
        for (const selector of selectors) {
            const text = textOf(node.querySelector(selector));

            if (text !== null) {
                return text;
            }
        }

        node = node.parentElement;
    }

    return null;
};

/**
 * Strips a site's boilerplate off `document.title`.
 * @param patterns Applied in order; each match is removed.
 * @returns The trimmed title, which may be empty.
 */
export const pageTitle = (patterns: readonly RegExp[]): string => {
    let title = document.title.replace(/[‎‏]/g, "").trim();

    for (const pattern of patterns) {
        title = title.replace(pattern, "").trim();
    }

    return title;
};

/**
 * `Artist - Title`, skipping whichever half is missing.
 * @param fallback Used when neither half is present.
 * @returns A single line, never empty.
 */
export const joinLabel = (
    artist: string | null,
    title: string | null,
    fallback: string,
): string => {
    if (artist !== null && title !== null && artist !== title) {
        return `${artist} - ${title}`;
    }

    return title ?? artist ?? fallback;
};

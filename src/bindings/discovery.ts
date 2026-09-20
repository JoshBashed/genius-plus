import { Result } from "@resulted/results";
import type { BindingError, UnsupportedPageError } from "./errors";

/** Chunk URLs are read from the live `<head>`; every hash changes daily. */

/** Anchored on length: a hash may itself contain `-` or `_`. */
const HASHED = /^(.*)-[A-Za-z0-9_-]{8}$/;

/** Base names, hashes stripped, mapped to the URL the page imported. */
export interface ChunkIndex {
    readonly urls: ReadonlyMap<string, string>;
    /** Base names loaded more than once; looking one up is an error. */
    readonly duplicates: ReadonlySet<string>;
    /** Entry `script[type=module]` sources, in document order. */
    readonly entries: readonly string[];
}

/** Corroborating signals, so an error can say what was missing. */
export interface PageMarkers {
    readonly moduleScripts: number;
    readonly modulePreloads: number;
    readonly preloadedState: boolean;
    readonly appConfig: boolean;
    readonly reactRoot: boolean;
    readonly styledComponents: boolean;
}

/** The legacy page is an A/B bucket, so it is a variant, not an error. */
export type GeniusPage =
    | {
          readonly kind: "react";
          readonly chunks: ChunkIndex;
          readonly markers: PageMarkers;
      }
    | { readonly kind: "legacy"; readonly markers: PageMarkers };

const isGeniusHost = (): boolean =>
    location.hostname === "genius.com" ||
    location.hostname.endsWith(".genius.com");

const baseNameOf = (url: string): string | null => {
    const file = new URL(url, document.baseURI).pathname.split("/").pop();

    if (file === undefined || !file.endsWith(".js")) {
        return null;
    }

    const stem = file.slice(0, -".js".length);
    return HASHED.exec(stem)?.[1] ?? stem;
};

/** `.href`, not `getAttribute`: the module map keys on resolved URLs. */
const buildIndex = (): ChunkIndex => {
    const urls = new Map<string, string>();
    const duplicates = new Set<string>();

    const add = (url: string): void => {
        const base = baseNameOf(url);

        if (base === null) {
            return;
        }

        const existing = urls.get(base);

        if (existing === undefined) {
            urls.set(base, url);
            return;
        }

        if (existing !== url) {
            duplicates.add(base);
        }
    };

    const preloads = document.querySelectorAll<HTMLLinkElement>(
        'head link[rel="modulepreload"][href]',
    );
    for (const link of preloads) {
        add(link.href);
    }

    const scripts = document.querySelectorAll<HTMLScriptElement>(
        'head script[type="module"][src]',
    );
    const entries: string[] = [];
    for (const script of scripts) {
        entries.push(script.src);
        add(script.src);
    }

    return { urls, duplicates, entries };
};

const hasReactRoot = (): boolean => {
    const root = document.querySelector("#application");

    // Only the prefix of the fiber container key is stable.
    return (
        root !== null &&
        Object.keys(root).some((key) => key.startsWith("__reactContainer$"))
    );
};

const readMarkers = (chunks: ChunkIndex): PageMarkers => ({
    moduleScripts: chunks.entries.length,
    modulePreloads: document.querySelectorAll(
        'head link[rel="modulepreload"][href]',
    ).length,
    preloadedState: "__PRELOADED_STATE__" in window,
    appConfig: "__APP_CONFIG__" in window,
    reactRoot: hasReactRoot(),
    styledComponents:
        document.querySelector('style[data-styled="active"]') !== null,
});

/**
 * One line naming every signal, for error messages and logs.
 * @returns A comma-separated summary of `markers`.
 */
export const describeMarkers = (markers: PageMarkers): string =>
    [
        `${markers.moduleScripts} module scripts`,
        `${markers.modulePreloads} modulepreloads`,
        `preloadedState=${markers.preloadedState}`,
        `appConfig=${markers.appConfig}`,
        `reactRoot=${markers.reactRoot}`,
        `styledComponents=${markers.styledComponents}`,
    ].join(", ");

/**
 * Three-way: a React page, the legacy page, or a genuine failure.
 * @returns A `react` or `legacy` page, or `unsupported` off genius.com.
 */
export const detectPage = (): Result<GeniusPage, UnsupportedPageError> => {
    if (!isGeniusHost()) {
        return Result.err({
            kind: "unsupported",
            reason: `Genius+ bindings only run on genius.com, not ${location.hostname}`,
        });
    }

    const reactRoot = document.querySelector("#application");

    const chunks = buildIndex();
    const markers = readMarkers(chunks);

    if (!reactRoot) return Result.ok({ kind: "legacy", markers });

    return Result.ok({ kind: "react", chunks, markers });
};

/**
 * Chunks this page never loaded, taken from one that did.
 *
 * A module is only ever the page's own instance when the URL matches
 * exactly, so a borrowed chunk is only safe while both pages come from
 * the same deploy. `borrowChunks` is what checks that.
 */
const borrowed = new Map<string, string>();

/** Reads chunk URLs out of another page's markup. */
export const readChunkUrls = (html: string): ReadonlyMap<string, string> => {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const urls = new Map<string, string>();

    const add = (href: string): void => {
        // The parsed document has no base, so links stay relative.
        const url = new URL(href, location.origin).href;
        const base = baseNameOf(url);

        if (base !== null && !urls.has(base)) {
            urls.set(base, url);
        }
    };

    for (const link of parsed.querySelectorAll<HTMLLinkElement>(
        'head link[rel="modulepreload"][href]',
    )) {
        add(link.getAttribute("href") ?? "");
    }

    for (const script of parsed.querySelectorAll<HTMLScriptElement>(
        'head script[type="module"][src]',
    )) {
        add(script.getAttribute("src") ?? "");
    }

    return urls;
};

/**
 * Adds another page's chunks to the ones this page may bind.
 *
 * @param theirs That page's chunk URLs, by base name.
 * @param ours This page's own, which decide whether the two agree.
 * @returns How many chunks were taken, or a `binding` error when the two
 * pages are different builds, in which case sharing a module would hand
 * us a second React rather than the page's own.
 */
export const borrowChunks = (
    theirs: ReadonlyMap<string, string>,
    ours: ChunkIndex,
): Result<number, BindingError> => {
    const shared = [...ours.urls].filter(([base]) => theirs.has(base));
    const disagreed = shared.filter(([base, url]) => theirs.get(base) !== url);

    if (shared.length === 0) {
        return Result.err({
            kind: "binding",
            target: "another page's chunks",
            reason: "the two pages have no module in common, so nothing vouches for them being the same build",
        });
    }

    if (disagreed.length > 0) {
        return Result.err({
            kind: "binding",
            target: "another page's chunks",
            reason: `${disagreed.length} of ${shared.length} shared modules have different URLs (${disagreed
                .map(([base]) => base)
                .join(", ")}), so that page is a different build`,
        });
    }

    let taken = 0;

    for (const [base, url] of theirs) {
        if (!ours.urls.has(base) && !borrowed.has(base)) {
            borrowed.set(base, url);
            taken += 1;
        }
    }

    return Result.ok(taken);
};

/** Forgets every borrowed chunk, so a re-prime starts clean. */
export const clearBorrowed = (): void => {
    borrowed.clear();
};

/**
 * Exact base name first, then a unique prefix match.
 * The page's own chunks win; a borrowed one is only ever a fallback.
 * @returns The URL, or a `binding` error if absent or ambiguous.
 */
export const resolveChunk = (
    index: ChunkIndex,
    baseName: string,
): Result<string, BindingError> => {
    const chunks: ChunkIndex =
        borrowed.size === 0
            ? index
            : {
                  duplicates: index.duplicates,
                  entries: index.entries,
                  urls: new Map([...borrowed, ...index.urls]),
              };

    if (chunks.duplicates.has(baseName)) {
        return Result.err({
            kind: "binding",
            target: `chunk "${baseName}"`,
            reason: "this page loads several different chunks under that base name; identify it another way",
        });
    }

    const exact = chunks.urls.get(baseName);

    if (exact !== undefined) {
        return Result.ok(exact);
    }

    const prefixed = [...chunks.urls].filter(([base]) =>
        base.startsWith(`${baseName}-`),
    );
    const only = prefixed.length === 1 ? prefixed[0] : undefined;

    if (only !== undefined) {
        return Result.ok(only[1]);
    }

    return Result.err({
        kind: "binding",
        target: `chunk "${baseName}"`,
        reason:
            prefixed.length > 1
                ? `${prefixed.length} preloaded modules start with that name (${prefixed
                      .map(([base]) => base)
                      .join(", ")})`
                : `not among the ${chunks.urls.size} modules this page preloaded; Genius probably renamed or dropped it`,
    });
};

/**
 * Same, for chunks whose base name is itself likely to drift.
 * @param target Named in the error when nothing matches.
 * @returns The URL of the one matching chunk, or a `binding` error.
 */
export const resolveChunkMatching = (
    index: ChunkIndex,
    pattern: RegExp,
    target: string,
): Result<string, BindingError> => {
    const chunks: ChunkIndex =
        borrowed.size === 0
            ? index
            : {
                  duplicates: index.duplicates,
                  entries: index.entries,
                  urls: new Map([...borrowed, ...index.urls]),
              };
    const matches = [...chunks.urls].filter(
        ([base]) => pattern.test(base) && !chunks.duplicates.has(base),
    );
    const only = matches.length === 1 ? matches[0] : undefined;

    if (only !== undefined) {
        return Result.ok(only[1]);
    }

    return Result.err({
        kind: "binding",
        target,
        reason:
            matches.length === 0
                ? `no preloaded module matches ${String(pattern)}`
                : `${matches.length} preloaded modules match ${String(pattern)} (${matches
                      .map(([base]) => base)
                      .join(", ")})`,
    });
};

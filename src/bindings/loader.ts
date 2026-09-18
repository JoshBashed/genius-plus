import { Result } from "@resulted/results";
import type { AppResult } from "@/utilities/result";
import {
    type ChunkIndex,
    describeMarkers,
    detectPage,
    type GeniusPage,
    resolveChunk,
    resolveChunkMatching,
} from "./discovery";
import type { ModuleNamespace } from "./types";

const loaded = new Map<string, Promise<AppResult<ModuleNamespace>>>();

/** Bumped by every reset, so a load in flight cannot write back late. */
let generation = 0;

const importModule = async (
    url: string,
): Promise<AppResult<ModuleNamespace>> => {
    // Must stay a native `import()` of a runtime string.
    const imported = await Result.try(
        import(/* webpackIgnore: true */ url) as Promise<unknown>,
    );

    if (imported.isErr()) {
        return Result.err({
            kind: "binding",
            target: url,
            reason: `import() rejected: ${String(imported.error)}`,
        });
    }

    if (typeof imported.value !== "object" || imported.value === null) {
        return Result.err({
            kind: "binding",
            target: url,
            reason: "import() resolved to something that is not a module",
        });
    }

    return Result.ok(imported.value as ModuleNamespace);
};

/**
 * The identical URL string is what yields the page's own instance.
 * @param url The absolute URL exactly as the page imported it.
 * @returns The namespace, cached per URL on success only, or a `binding` error.
 */
export const loadChunkUrl = (
    url: string,
): Promise<AppResult<ModuleNamespace>> => {
    const existing = loaded.get(url);

    if (existing !== undefined) {
        return existing;
    }

    const era = generation;
    const pending = importModule(url).then((outcome) => {
        // A transient failure must not poison the URL for the document.
        if (outcome.isErr() && era === generation) {
            loaded.delete(url);
        }

        return outcome;
    });

    loaded.set(url, pending);
    return pending;
};

let page: GeniusPage | null = null;

/**
 * Cached on success only; a miss may just mean `<head>` is unfinished.
 * @returns The detected page, or whatever `detectPage` rejected with.
 */
export const getPage = (): AppResult<GeniusPage> => {
    if (page !== null) {
        return Result.ok(page);
    }

    const detected = detectPage();

    if (detected.isOk()) {
        page = detected.value;
    }

    return detected;
};

const requireChunks = (target: string): AppResult<ChunkIndex> => {
    const current = getPage();

    if (current.isErr()) {
        return current;
    }

    if (current.value.kind !== "react") {
        return Result.err({
            kind: "binding",
            target,
            reason: `this is the legacy Genius page, which ships no module chunks (${describeMarkers(
                current.value.markers,
            )})`,
        });
    }

    return Result.ok(current.value.chunks);
};

/**
 * Loads one of the page's chunks by its base name, hash stripped.
 * @param baseName A source file name, such as `"TagInput"`.
 * @returns The namespace, or a `binding` error naming the chunk.
 */
export const loadChunk = async (
    baseName: string,
): Promise<AppResult<ModuleNamespace>> => {
    const target = `chunk "${baseName}"`;
    const chunks = requireChunks(target);

    if (chunks.isErr()) {
        return chunks;
    }

    const url = resolveChunk(chunks.value, baseName);
    return url.isOk() ? loadChunkUrl(url.value) : url;
};

/**
 * For chunks whose base name is a bundler artefact and may drift.
 * @param target Named in the error when nothing matches.
 * @returns The namespace, or a `binding` error.
 */
export const loadChunkMatching = async (
    pattern: RegExp,
    target: string,
): Promise<AppResult<ModuleNamespace>> => {
    const chunks = requireChunks(target);

    if (chunks.isErr()) {
        return chunks;
    }

    const url = resolveChunkMatching(chunks.value, pattern, target);
    return url.isOk() ? loadChunkUrl(url.value) : url;
};

const resets: (() => void)[] = [];

/**
 * Memoises a successful lookup only, so a miss can be retried.
 * @returns A wrapped `build` that `resetBindings` also clears.
 */
export const memoBinding = <T>(
    build: () => Promise<AppResult<T>>,
): (() => Promise<AppResult<T>>) => {
    let settled: AppResult<T> | null = null;
    let pending: Promise<AppResult<T>> | null = null;

    resets.push(() => {
        settled = null;
        pending = null;
    });

    return async () => {
        if (settled !== null) {
            return settled;
        }

        const era = generation;
        pending ??= build();
        const outcome = await pending;

        // A reset mid-build means this answer describes a gone document.
        if (era !== generation) {
            return outcome;
        }

        if (outcome.isOk()) {
            settled = outcome;
        } else {
            pending = null;
        }

        return outcome;
    };
};

/** Drops every cache. Call this after a client-side navigation. */
export const resetBindings = (): void => {
    generation += 1;
    page = null;
    loaded.clear();
    for (const reset of resets) {
        reset();
    }
};

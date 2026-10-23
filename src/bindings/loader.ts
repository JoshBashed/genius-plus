import { Result } from "@resulted/results";
import {
    type ChunkIndex,
    describeMarkers,
    detectPage,
    type GeniusPage,
} from "@/bindings/discovery";
import type { ChunkError, UnsupportedPageError } from "@/bindings/errors";
import type { ModuleNamespace } from "@/bindings/types";
import { JSLinker } from "@/content/genius/utilities/jsLinker";

/** A memoised lookup of one borrowed value, and how it can fail. */
export type Binding<Value> = () => Promise<Result<Value, ChunkError>>;

/** Bumped by every reset, so a load in flight cannot write back late. */
let generation = 0;

let page: GeniusPage | null = null;

/**
 * Cached on success only; a miss may just mean `<head>` is unfinished.
 * @returns The detected page, or whatever `detectPage` rejected with.
 */
export const getPage = (): Result<GeniusPage, UnsupportedPageError> => {
    if (page !== null) {
        return Result.ok(page);
    }

    const detected = detectPage();

    if (detected.isOk()) {
        page = detected.value;
    }

    return detected;
};

const requireChunks = (target: string): Result<ChunkIndex, ChunkError> => {
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
): Promise<Result<ModuleNamespace, ChunkError>> => {
    const target = `chunk "${baseName}"`;
    const chunks = requireChunks(target);

    if (chunks.isErr()) {
        return chunks;
    }

    return JSLinker.shared().findAndLoadBundleByName(baseName);
};

/**
 * Loads whichever chunk exports the component with this display name.
 * @param own The chunk it lives in unless Genius moved it.
 * @returns The namespace, or a `binding` error naming the component.
 */
export const loadChunkExporting = async (
    name: string,
    own?: string,
): Promise<Result<ModuleNamespace, ChunkError>> => {
    const chunks = requireChunks(`component "${name}"`);

    if (chunks.isErr()) {
        return chunks;
    }

    return JSLinker.shared().findAndLoadBundleExporting(name, own);
};

/**
 * For chunks whose base name is a bundler artefact and may drift.
 * @param target Named in the error when nothing matches.
 * @returns The namespace, or a `binding` error.
 */
export const loadChunkMatching = async (
    pattern: RegExp,
    target: string,
): Promise<Result<ModuleNamespace, ChunkError>> => {
    const chunks = requireChunks(target);

    if (chunks.isErr()) {
        return chunks;
    }

    return JSLinker.shared().findAndLoadBundleMatching(pattern, target);
};

const resets: (() => void)[] = [];

/**
 * Memoises a successful lookup only, so a miss can be retried.
 * @returns A wrapped `build` that `resetBindings` also clears.
 */
export const memoBinding = <T, Err = ChunkError>(
    build: () => Promise<Result<T, Err>>,
): (() => Promise<Result<T, Err>>) => {
    let settled: Result<T, Err> | null = null;
    let pending: Promise<Result<T, Err>> | null = null;

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
    JSLinker.shared().reset();
    for (const reset of resets) {
        reset();
    }
};

/** Reading Apple's per song credits for a whole album. */
import type { AppleSongCredits } from "@/utilities/appleCredits";
import { readAppleCredits } from "@/utilities/appleCredits";
import type { DecodeFailure } from "@/utilities/decode";
import { log } from "@/utilities/log";
import { drain } from "../pool";
import { type CreditsError, fetchSongCredits } from "../relay";

/** One line for whatever stopped a track's credits arriving. */
const describeCreditsError = (error: CreditsError | DecodeFailure): string => {
    switch (error.kind) {
        case "network":
            return `could not reach ${error.url}`;
        case "http":
            return `Apple answered ${error.status}`;
        case "no-receiver":
            return "the extension was reloading";
        default:
            return error.reason;
    }
};

import type { ImportedAlbum } from "./importedAlbum";

/** One call per track, matching the metadata reads beside it. */
const CONCURRENCY = 4;

/** Each track's credits, by Apple's track id. */
export type AlbumCredits = ReadonlyMap<number, AppleSongCredits>;

/** What a read produced, and what it could not. */
export interface CreditsReport {
    readonly credits: AlbumCredits;
    /** One line per track that gave nothing, in track order. */
    readonly failures: readonly string[];
}

/**
 * Reads every track's credits page.
 *
 * Apple puts writers and producers on the song page and nowhere in the
 * album lookup, so this is a page fetch per track. It is the slowest
 * part of an import by far, which is why it is asked for rather than
 * done by default.
 *
 * @param onProgress Called with how many tracks have been read.
 * @returns What it managed to read; a track that failed is simply absent.
 */
export const loadAlbumCredits = async (
    album: ImportedAlbum,
    storefront: string,
    onProgress: (done: number, total: number) => void = () => {},
): Promise<CreditsReport> => {
    const credits = new Map<number, AppleSongCredits>();
    const failures: string[] = [];
    const total = album.tracks.length;
    let done = 0;

    await drain(album.tracks, CONCURRENCY, async (track) => {
        const answer = await fetchSongCredits(storefront, track.key);
        const parsed = answer.isErr() ? answer : readAppleCredits(answer.value);

        if (parsed.isOk()) {
            credits.set(track.key, parsed.value);
        } else {
            // Swallowing these is how a total failure came to look like
            // an album that simply has no credits.
            const reason = describeCreditsError(parsed.error);

            failures.push(`${track.title}: ${reason}`);
            log.warn(`genius: credits for ${track.title}`, reason);
        }

        done += 1;
        onProgress(done, total);
    });

    if (failures.length > 0) {
        log.warn(`genius: read credits for ${credits.size} of ${total} tracks`);
    }

    return { credits, failures };
};

/** Every name the credits mention, so they can be resolved with the rest. */
export const creditNames = (credits: AlbumCredits): readonly string[] => {
    const seen = new Set<string>();
    const names: string[] = [];

    for (const song of credits.values()) {
        for (const name of [...song.writers, ...song.producers]) {
            const key = name.trim().toLowerCase();

            if (key !== "" && !seen.has(key)) {
                seen.add(key);
                names.push(name.trim());
            }
        }
    }

    return names;
};

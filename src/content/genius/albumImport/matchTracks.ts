/** Pairs the imported tracks with the album's existing rows. */
import type { TrackSeed } from "../pageState";
import type { ImportedTrack } from "./importedAlbum";

export interface TrackMatch {
    readonly imported: ImportedTrack;
    /** The row it pairs with, or `null` when the album has no such song. */
    readonly songId: number | null;
    /**
     * The name a created song takes.
     * Apple's, unless the reader changed it: Genius rejects a title with
     * no Latin characters in it, so renaming has to be possible.
     */
    readonly title: string;
}

export interface MatchResult {
    readonly matches: readonly TrackMatch[];
}

/**
 * A title reduced to the letters and digits in it.
 * Apple and Genius disagree about apostrophes, case, and punctuation on
 * roughly every other title, and about nothing else.
 */
export const titleKey = (title: string): string =>
    title
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        // Letters and digits in any script: stripping to `a-z0-9` left
        // every CJK title as the empty string, so they all matched each
        // other and none matched itself.
        .replace(/[^\p{L}\p{N}]+/gu, "");

/** Genius refuses a title with no Latin letters anywhere in it. */
const LATIN = /\p{Script=Latin}/u;

/**
 * Whether Genius will create a song under this title.
 * A CJK title has to be renamed before the tracklist call takes it.
 */
export const titleAccepted = (title: string): boolean => LATIN.test(title);

const slotKey = (disc: number | null, track: number | null): string =>
    `${disc ?? 1}:${track ?? 0}`;

/**
 * Matches on title first, then on track number, and claims each row once.
 * Title equality is the stronger signal: numbers agree by coincidence on
 * any two albums of the same length.
 */
export const matchTracks = (
    imported: readonly ImportedTrack[],
    seeds: readonly TrackSeed[],
): MatchResult => {
    const claimed = new Set<number>();
    const byTitle = new Map<string, TrackSeed[]>();
    const bySlot = new Map<string, TrackSeed>();

    for (const seed of seeds) {
        const key = titleKey(seed.title);
        const sharing = byTitle.get(key);

        if (sharing === undefined) {
            byTitle.set(key, [seed]);
        } else {
            sharing.push(seed);
        }

        const slot = slotKey(seed.discNumber, seed.trackNumber);

        // A duplicated slot is ambiguous, so neither entry may claim it.
        if (seed.trackNumber !== null && !bySlot.has(slot)) {
            bySlot.set(slot, seed);
        }
    }

    const take = (seed: TrackSeed | undefined): TrackSeed | null => {
        if (seed === undefined || claimed.has(seed.songId)) {
            return null;
        }

        claimed.add(seed.songId);
        return seed;
    };

    const matches: TrackMatch[] = imported.map((track) => ({
        imported: track,
        songId: null,
        title: track.title,
    }));

    const pass = (
        find: (track: ImportedTrack) => TrackSeed | undefined,
    ): void => {
        matches.forEach((match, index) => {
            if (match.songId !== null) {
                return;
            }

            const seed = take(find(match.imported));

            if (seed !== null) {
                matches[index] = { ...match, songId: seed.songId };
            }
        });
    };

    pass((track) =>
        byTitle
            .get(titleKey(track.title))
            ?.find((seed) => !claimed.has(seed.songId)),
    );
    pass((track) => bySlot.get(slotKey(track.discNumber, track.trackNumber)));

    return { matches };
};

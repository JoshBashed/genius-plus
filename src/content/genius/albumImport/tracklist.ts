/** The album's own tracklist, which is how a song gets created at all. */
import type { Result } from "@resulted/results";
import type { TrackMatch } from "@/content/genius/albumImport/matchTracks";
import * as geniusApi from "@/content/genius/geniusApi";
import type { TrackSeed } from "@/content/genius/pageState";
import { describeRequestError } from "@/utilities/http";

/**
 * Every way writing an album's tracklist fails.
 *
 * Flat by design: nothing here forwards the API layer's own error, and
 * each variant carries only what its own line has to say.
 */
export type TracklistFailure =
    /** It never reached Genius. */
    | { readonly kind: "networkError" }
    /** Genius refused it, in its own words. */
    | { readonly kind: "refused"; readonly message: string }
    /** Genius took it and answered with something else. */
    | { readonly kind: "unreadable"; readonly reason: string };

/** One line naming why the tracklist was not written. */
export const describeTracklistFailure = (error: TracklistFailure): string => {
    switch (error.kind) {
        case "networkError":
            return "The tracklist write did not get through";
        case "refused":
            return error.message;
        case "unreadable":
            return `Genius took the tracklist but answered with ${error.reason}`;
    }
};

/** Flattens a write failure into what a reader actually needs. */
const asFailure = (error: geniusApi.WriteFailure): TracklistFailure => {
    switch (error.kind) {
        case "network":
            return { kind: "networkError" };
        case "http":
            return { kind: "refused", message: describeRequestError(error) };
        case "auth":
            return { kind: "refused", message: error.reason };
        case "decode":
            return { kind: "unreadable", reason: error.reason };
    }
};

/** What their editor marks a song nobody has transcribed yet. */
const NEW_STATE = "incomplete";

export interface CreatedTrack {
    readonly title: string;
    readonly trackNumber: number;
}

export interface TracklistPlan {
    /** The whole tracklist, because the endpoint replaces it outright. */
    readonly entries: readonly geniusApi.TracklistEntry[];
    readonly created: readonly CreatedTrack[];
    /**
     * The Apple track each entry came from, aligned with `entries`.
     *
     * `null` for a song carried through that this import named nothing
     * for. Binding a created song by this rather than by its title is
     * the only way two tracks that normalise alike stay apart.
     */
    readonly keys: readonly (number | null)[];
}

/**
 * Plans the tracklist an import would leave behind.
 *
 * The endpoint takes the album's entire tracklist and replaces it, so
 * every existing song is carried through even when the import says
 * nothing about it. A song left out is a song taken off the album.
 *
 * @param seeds Every song already on the album, re-read at send time.
 */
export const planTracklist = (
    matches: readonly TrackMatch[],
    seeds: readonly TrackSeed[],
): TracklistPlan => {
    const seedById = new Map(seeds.map((seed) => [seed.songId, seed]));
    const paired = new Set<number>();

    for (const match of matches) {
        if (match.songId !== null) {
            paired.add(match.songId);
        }
    }

    const entries: geniusApi.TracklistEntry[] = [];
    const created: CreatedTrack[] = [];
    const keys: (number | null)[] = [];
    /** Counted per disc, because that is what the field means. */
    const nextOnDisc = new Map<number, number>();
    let placeholder = 0;

    const place = (disc: number): number => {
        const next = (nextOnDisc.get(disc) ?? 0) + 1;

        nextOnDisc.set(disc, next);
        return next;
    };

    // Import order decides placement, so a created song lands where
    // Apple has it rather than after everything already on the album.
    for (const match of matches) {
        const disc = match.imported.discNumber ?? 1;
        const seed =
            match.songId === null ? undefined : seedById.get(match.songId);

        // An existing song keeps its own title: this call orders and
        // creates, and a rename belongs to the staged save beside it.
        if (seed !== undefined) {
            keys.push(match.imported.key);
            entries.push({
                disc_number: disc,
                disc_track_number: place(disc),
                song_id: seed.songId,
            });
            continue;
        }

        placeholder += 1;
        created.push({ title: match.title, trackNumber: place(disc) });
        keys.push(match.imported.key);
        entries.push({
            disc_number: disc,
            disc_track_number: nextOnDisc.get(disc) ?? 1,
            lyrics_state: NEW_STATE,
            song_id: `new_${placeholder}`,
            title: match.title,
        });
    }

    // A song the import never named still belongs to the album.
    for (const seed of seeds) {
        if (paired.has(seed.songId)) {
            continue;
        }

        const disc = seed.discNumber ?? 1;

        keys.push(null);
        entries.push({
            disc_number: disc,
            disc_track_number: place(disc),
            song_id: seed.songId,
        });
    }

    return {
        created,
        entries,
        keys,
    };
};

/** One placement, as Genius reports it back after a write. */
export interface TracklistAppearance {
    readonly songId: number;
    readonly trackNumber: number | null;
}

/**
 * Replaces the album's tracklist, creating every placeholder song in it.
 *
 * @returns Every placement it reported. A row that does not parse is
 * dropped rather than failed: the write has already happened by then,
 * and saying otherwise would be worse than saying less.
 */
export const putTracklist = async (
    albumId: number,
    entries: readonly geniusApi.TracklistEntry[],
    viewableByRoles: readonly number[] = [],
): Promise<Result<readonly TracklistAppearance[], TracklistFailure>> => {
    const response = await geniusApi.updateTracklist(
        albumId,
        entries,
        viewableByRoles,
    );

    return response
        .map((appearances) =>
            appearances.map(
                (appearance): TracklistAppearance => ({
                    songId: appearance.song.id,
                    trackNumber: appearance.track_number ?? null,
                }),
            ),
        )
        .mapErr(asFailure);
};

/** The album's own tracklist, which is how a song gets created at all. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { decode, decodeOr } from "@/utilities/decode";
import { describeRequestError } from "@/utilities/http";
import { apiPut, type WriteFailure } from "../api";
import type { TrackSeed } from "../pageState";
import type { TrackMatch } from "./matchTracks";

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
const asFailure = (error: WriteFailure): TracklistFailure => {
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

/**
 * One row of the payload their own tracklist editor sends.
 * A `song_id` that is not a number is a placeholder, and Genius creates
 * the song from `title` rather than moving an existing one.
 */
export interface TracklistEntry {
    /** Which disc, counted from one. */
    readonly disc_number: number;
    /** The position within that disc, not across the album. */
    readonly disc_track_number: number;
    readonly song_id: number | string;
    readonly title?: string;
    readonly lyrics_state?: string;
}

/** What their editor marks a song nobody has transcribed yet. */
const NEW_STATE = "incomplete";

export interface CreatedTrack {
    readonly title: string;
    readonly trackNumber: number;
}

export interface TracklistPlan {
    /** The whole tracklist, because the endpoint replaces it outright. */
    readonly entries: readonly TracklistEntry[];
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

    const entries: TracklistEntry[] = [];
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

const appearanceSchema = z.object({
    song: z.object({ id: z.number() }),
    track_number: z.number().nullish(),
});

const answerSchema = z.object({ album_appearances: z.array(z.unknown()) });

/**
 * Replaces the album's tracklist, creating every placeholder song in it.
 *
 * @returns Every placement it reported. A row that does not parse is
 * dropped rather than failed: the write has already happened by then,
 * and saying otherwise would be worse than saying less.
 */
export const putTracklist = async (
    albumId: number,
    entries: readonly TracklistEntry[],
    viewableByRoles: readonly number[] = [],
): Promise<Result<readonly TracklistAppearance[], TracklistFailure>> => {
    const response = await apiPut(`/albums/${albumId}/tracklist`, {
        // Their React album page sends all three; the legacy page sent a
        // flat `track_number` that this endpoint ignores.
        react_album_page: true,
        tracklist: entries,
        // Carried through, not emptied: the capture showed `[]` because
        // that album was unrestricted, and sending it to one that is not
        // would lift the restriction.
        viewable_by_roles: viewableByRoles,
    });

    if (response.isErr()) {
        return Result.err(asFailure(response.error));
    }

    const answer = decode(
        answerSchema,
        response.value,
        `album ${albumId} tracklist`,
    );

    if (answer.isErr()) {
        return Result.err({
            kind: "unreadable",
            reason: answer.error.reason,
        });
    }

    return Result.ok(
        answer.value.album_appearances.flatMap(
            (row): readonly TracklistAppearance[] => {
                const parsed = decodeOr(appearanceSchema, row);

                return parsed === null
                    ? []
                    : [
                          {
                              songId: parsed.song.id,
                              trackNumber: parsed.track_number ?? null,
                          },
                      ];
            },
        ),
    );
};

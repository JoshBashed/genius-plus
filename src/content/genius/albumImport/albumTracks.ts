/** The album's tracklist, re-read from Genius after it has been written. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { decode, decodeOr } from "@/utilities/decode";
import { describeRequestError } from "@/utilities/http";
import { apiGet, type ReadFailure } from "../api";
import type { TrackSeed } from "../pageState";

/**
 * Every way reading an album's tracklist fails.
 *
 * Flat by design: nothing here forwards the API layer's own error, and
 * each variant carries only what its own line has to say.
 */
export type AlbumTracksFailure =
    /** It never reached Genius. */
    | { readonly kind: "networkError" }
    /** Genius refused it, in its own words. */
    | { readonly kind: "refused"; readonly message: string }
    /** Genius answered with something that is not a tracklist. */
    | { readonly kind: "unreadable"; readonly reason: string };

/** One line naming why an album's tracks could not be read. */
export const describeAlbumTracksFailure = (
    error: AlbumTracksFailure,
): string => {
    switch (error.kind) {
        case "networkError":
            return "The request for the album's tracks did not get through";
        case "refused":
            return error.message;
        case "unreadable":
            return `Genius listed the album's tracks as ${error.reason}`;
    }
};

/** Flattens a read failure into what a reader actually needs. */
const asFailure = (error: ReadFailure): AlbumTracksFailure => {
    if (error.kind === "network") {
        return { kind: "networkError" };
    }

    return error.kind === "http"
        ? { kind: "refused", message: describeRequestError(error) }
        : { kind: "unreadable", reason: error.reason };
};

/** Their page size; the call pages rather than taking a bigger one. */
const PER_PAGE = 50;

/** A ceiling, so a server that always names a next page cannot spin. */
const MAX_PAGES = 20;

/** One row of their tracklist: the placement, and the song on it. */
const trackSchema = z.object({
    disc_number: z.number().nullish(),
    number: z.number().nullish(),
    song: z.object({
        hidden: z.boolean().nullish(),
        id: z.number(),
        primary_artists: z
            .array(z.object({ id: z.number(), name: z.string() }))
            .default([]),
        title: z.string(),
        url: z.string().nullish(),
    }),
});

const pageSchema = z.object({
    next_page: z.number().nullish(),
    tracks: z.array(z.unknown()),
});

const asSeed = (row: z.output<typeof trackSchema>): TrackSeed => ({
    discNumber: row.disc_number ?? null,
    hidden: row.song.hidden === true,
    primaryArtists: row.song.primary_artists,
    songId: row.song.id,
    title: row.song.title,
    trackNumber: row.number ?? null,
    url: row.song.url ?? null,
});

/**
 * Reads every track on an album, following Genius's own paging.
 * @returns The tracks in the order Genius lists them, which is by number.
 */
export const loadAlbumTracks = async (
    albumId: number,
): Promise<Result<readonly TrackSeed[], AlbumTracksFailure>> => {
    const tracks: TrackSeed[] = [];
    let page = 1;

    for (let visited = 0; visited < MAX_PAGES; visited += 1) {
        const response = await apiGet(`/albums/${albumId}/tracks`, {
            page: String(page),
            per_page: String(PER_PAGE),
        });

        if (response.isErr()) {
            return Result.err(asFailure(response.error));
        }

        const body = decode(
            pageSchema,
            response.value,
            `album ${albumId} tracks`,
        );

        if (body.isErr()) {
            return Result.err({
                kind: "unreadable",
                reason: body.error.reason,
            });
        }

        // A row we cannot read is a track we cannot name, not a failure.
        for (const row of body.value.tracks) {
            const track = decodeOr(trackSchema, row);

            if (track !== null) {
                tracks.push(asSeed(track));
            }
        }

        const next = body.value.next_page;

        if (next === null || next === undefined) {
            return Result.ok(tracks);
        }

        page = next;
    }

    // Genius still had pages to give. Answering `Ok` here would hand a
    // partial tracklist to a write that replaces the whole of it, and
    // every song past the cap would come off the album.
    return Result.err({
        kind: "unreadable",
        reason:
            `more than ${MAX_PAGES} pages of tracks, which is more than ` +
            "this can read without dropping songs",
    });
};

/** Genius's albums: their records, their tracks, and the writes to both. */
import type { Result } from "@resulted/results";
import { z } from "zod";
import type { DateComponents } from "@/bindings";
import {
    geniusRead,
    geniusWrite,
    type ReadFailure,
    type WriteFailure,
} from "@/content/genius/utilities/geniusApi/request";
import { dateSchema, rows } from "@/content/genius/utilities/geniusApi/schemas";

/** Their album shape, wherever one is returned. */
const albumSchema = z.object({
    album_type: z.string().nullish(),
    artist: z.object({ name: z.string() }).nullish(),
    cover_arts: z
        .array(z.object({ image_url: z.string().nullish() }))
        .nullish(),
    id: z.number(),
    name: z.string(),
    release_date_components: dateSchema.nullish(),
    url: z.string().nullish(),
    viewable_by_roles: z.array(z.number()).nullish(),
});

/** One album's record. */
export type Album = z.output<typeof albumSchema>;

/** `GET /albums/:id`. */
export const getAlbum = async (
    albumId: number,
): Promise<Result<Album, ReadFailure>> =>
    (
        await geniusRead(
            { path: `/albums/${albumId}`, what: `album ${albumId}` },
            z.object({ album: albumSchema }),
        )
    ).map((answer) => answer.album);

/** `GET /albums/autocomplete?q=`, the same list their own search uses. */
export const searchAlbums = async (
    query: string,
): Promise<Result<readonly Album[], ReadFailure>> =>
    (
        await geniusRead(
            {
                path: "/albums/autocomplete",
                query: { q: query },
                what: "the album autocomplete",
            },
            z.object({ albums: rows(albumSchema) }),
        )
    ).map((answer) => answer.albums);

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

const tracksPageSchema = z.object({
    next_page: z.number().nullish(),
    tracks: rows(trackSchema),
});

/** One page of an album's tracks, and the page after it, if any. */
export type TracksPage = z.output<typeof tracksPageSchema>;

/** One track on an album. */
export type Track = z.output<typeof trackSchema>;

/** `GET /albums/:id/tracks`, one page of them. */
export const getAlbumTracks = async (
    albumId: number,
    page: number,
    perPage: number,
): Promise<Result<TracksPage, ReadFailure>> =>
    geniusRead(
        {
            path: `/albums/${albumId}/tracks`,
            query: { page: String(page), per_page: String(perPage) },
            what: `album ${albumId} tracks`,
        },
        tracksPageSchema,
    );

/** Their four kinds, as their own editor offers them. */
export type AlbumType = "album" | "ep" | "single" | "mixtape";

/** One cover, by the URL whatever hosted it answered with. */
export interface CoverArt {
    readonly image_url: string;
}

/** Everything `PUT /albums/:id` takes that this extension ever sets. */
export interface AlbumFields {
    readonly cover_arts?: readonly CoverArt[];
    readonly release_date_components?: DateComponents | null;
    /** Genius's own code, such as `"zh-Hant"`. */
    readonly language?: string;
    readonly album_type?: AlbumType;
}

/**
 * `PUT /albums/:id`, leaving every field `album` does not name alone.
 * @returns Nothing of use; the caller re-reads if it wants the record.
 */
export const updateAlbum = async (
    albumId: number,
    album: AlbumFields,
): Promise<Result<null, WriteFailure>> =>
    (
        await geniusWrite(
            {
                body: { album },
                method: "PUT",
                path: `/albums/${albumId}`,
                what: `album ${albumId}`,
            },
            z.unknown(),
        )
    ).map(() => null);

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

/** One placement, as Genius reports it back after a tracklist write. */
const appearanceSchema = z.object({
    song: z.object({ id: z.number() }),
    track_number: z.number().nullish(),
});

/** One placement on an album. */
export type Appearance = z.output<typeof appearanceSchema>;

/**
 * `PUT /albums/:id/tracklist`, which replaces the whole tracklist and
 * creates a song for every entry naming a title instead of an id.
 * @returns Every placement it reported.
 */
export const updateTracklist = async (
    albumId: number,
    tracklist: readonly TracklistEntry[],
    viewableByRoles: readonly number[],
): Promise<Result<readonly Appearance[], WriteFailure>> =>
    (
        await geniusWrite(
            {
                body: {
                    // Their React album page sends all three; the legacy
                    // page sent a flat `track_number` this ignores.
                    react_album_page: true,
                    tracklist,
                    // Carried through, not emptied: the capture showed
                    // `[]` because that album was unrestricted, and
                    // sending it to one that is not would lift it.
                    viewable_by_roles: viewableByRoles,
                },
                method: "PUT",
                path: `/albums/${albumId}/tracklist`,
                what: `album ${albumId} tracklist`,
            },
            z.object({ album_appearances: rows(appearanceSchema) }),
        )
    ).map((answer) => answer.album_appearances);

/** Their `Lt`: an existing entity by id, one Genius has never seen by name. */
export type EntityRef = { readonly id: number } | { readonly name: string };

/** A whole-set replace of one list field. */
export interface ListUpdate {
    readonly values: readonly EntityRef[];
}

/** A replace of one single-value field. */
export interface ValueUpdate<Value> {
    readonly value: Value;
    readonly replace: true;
}

/**
 * What `bulk_update_songs` takes that this extension ever sets. The
 * server permits nine keys and answers 422 to anything else.
 */
export interface BulkUpdate {
    readonly song_ids: readonly number[];
    readonly array_field_updates: {
        readonly primary_artists?: ListUpdate;
        readonly featured_artists?: ListUpdate;
        readonly writer_artists?: ListUpdate;
        readonly producer_artists?: ListUpdate;
        readonly tags?: ListUpdate;
    };
    readonly scalar_field_updates: {
        readonly release_date_components?: ValueUpdate<DateComponents>;
        readonly language?: ValueUpdate<string | null>;
        readonly primary_tag_id?: ValueUpdate<number | null>;
    };
}

/** A channel name, or nothing when it is absent or not one. */
const channelSchema = z.string().min(1).optional().catch(undefined);

/** The accepted task; the channel may sit on it or beside it. */
const bulkAnswerSchema = z.object({
    bulk_song_update_task: z
        .object({
            pusher_channel: channelSchema,
            task_id: z.union([z.number(), z.string()]),
        })
        .nullish()
        .catch(null),
    pusher_channel: channelSchema,
});

/** What a bulk update answers with: the task it queued, if any. */
export type BulkAnswer = z.output<typeof bulkAnswerSchema>;

/**
 * `PUT /albums/:id/bulk_update_songs`, which queues the edit and applies
 * it later over Pusher.
 */
export const bulkUpdateSongs = async (
    albumId: number,
    update: BulkUpdate,
): Promise<Result<BulkAnswer, WriteFailure>> =>
    geniusWrite(
        {
            body: update,
            method: "PUT",
            path: `/albums/${albumId}/bulk_update_songs`,
            what: `album ${albumId} bulk update`,
        },
        bulkAnswerSchema,
    );

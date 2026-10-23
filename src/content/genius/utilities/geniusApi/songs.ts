/** Genius's songs: reading one, writing one, creating one, and search. */
import type { Result } from "@resulted/results";
import { z } from "zod";
import type { DateComponents } from "@/bindings";
import {
    geniusRead,
    geniusWrite,
    type ReadFailure,
    type WriteFailure,
} from "@/content/genius/utilities/geniusApi/request";
import {
    type AlbumRef,
    albumRefSchema,
    dateSchema,
    refSchema,
    rows,
} from "@/content/genius/utilities/geniusApi/schemas";

/** Blank is how their API says absent, so it reads as absent here. */
const presentString = z
    .string()
    .nullish()
    .transform((value) => (value === undefined || value === "" ? null : value));

const songSchema = z.object({
    albums: rows(albumRefSchema).default([]),
    current_user_metadata: z
        .object({ permissions: z.array(z.string()).nullish() })
        .nullish(),
    featured_artists: rows(refSchema).default([]),
    id: z.number(),
    language: presentString,
    primary_artists: rows(refSchema).default([]),
    primary_tag: refSchema.nullish(),
    producer_artists: rows(refSchema).default([]),
    published: z.boolean().nullish(),
    release_date_components: dateSchema.nullish(),
    soundcloud_url: presentString,
    tags: rows(refSchema).default([]),
    title: z.string(),
    writer_artists: rows(refSchema).default([]),
    youtube_url: presentString,
});

/** One song's record, as `GET /songs/:id` answers with it. */
export type Song = z.output<typeof songSchema>;

/** `GET /songs/:id`, the whole record. */
export const getSong = async (
    songId: number,
): Promise<Result<Song, ReadFailure>> =>
    (
        await geniusRead(
            { path: `/songs/${songId}`, what: `song ${songId}` },
            z.object({ song: songSchema }),
        )
    ).map((answer) => answer.song);

/** A write's answer, of which only the stored song's albums are read. */
const writtenSchema = z.object({
    song: z
        .object({ albums: rows(albumRefSchema).default([]) })
        .nullish()
        .catch(null),
});

/** The song a write stored, as its answer lists it. */
export interface WrittenSong {
    readonly albums: readonly AlbumRef[];
}

/** An album a song is put on: one Genius has, or one to create. */
export type SongAlbumRef =
    | { readonly id: number }
    /** `_new` is their own marker for an album to bring into being. */
    | { readonly _new: true; readonly name: string };

/** The fields `PUT /songs/:id` takes that this extension ever sets. */
export interface SongUpdate {
    readonly title?: string;
    readonly soundcloud_url?: string | null;
    readonly youtube_url?: string | null;
    /** Replaces the whole list, so every album it stays on is sent too. */
    readonly albums?: readonly SongAlbumRef[];
}

/**
 * `PUT /songs/:id`, which applies at once rather than queueing.
 * @returns The stored song, or `null` when the 2xx carried none.
 */
export const updateSong = async (
    songId: number,
    song: SongUpdate,
): Promise<Result<WrittenSong | null, WriteFailure>> =>
    (
        await geniusWrite(
            {
                body: { song },
                method: "PUT",
                path: `/songs/${songId}`,
                what: `song ${songId}`,
            },
            writtenSchema,
        )
    ).map((answer) => answer.song ?? null);

const createdSchema = z.object({
    song: z.object({
        albums: rows(albumRefSchema).default([]),
        id: z.number(),
        title: z.string(),
        url: z.string().nullish(),
    }),
});

/** The song `POST /songs` made. */
export type CreatedSong = z.output<typeof createdSchema>["song"];

/** The three states their editor can create a song in. */
export type LyricsState = "complete" | "incomplete" | "unreleased";

/** An artist as their form sends one: the id, and the name beside it. */
export interface ArtistRef {
    readonly id?: number;
    readonly name: string;
}

/** A tag, as their form mirrors the primary one into the tag list. */
export interface TagRef {
    readonly id: number;
    readonly name: string;
    readonly isLocked?: true;
}

/**
 * The fields their Add A Song form actually posts.
 *
 * Read off a real request, not inferred: it sends eight keys and leaves
 * every empty one out entirely, so the optional ones here are omitted
 * rather than sent blank.
 */
export interface CreateSongFields {
    readonly title: string;
    readonly primary_artists: readonly ArtistRef[];
    readonly albums: readonly SongAlbumRef[];
    readonly primary_tag_id: number | null;
    /** Their form mirrors the primary tag into this list. */
    readonly tags?: readonly TagRef[];
    readonly release_date_components: DateComponents | null;
    /**
     * Always empty. Their client turns non-empty lyrics into their own
     * DOM tree, whose shape is unmeasured, so none is ever sent.
     */
    readonly lyrics: "";
    readonly lyrics_state: LyricsState;
    readonly featured_artists?: readonly ArtistRef[];
    readonly producer_artists?: readonly ArtistRef[];
    readonly writer_artists?: readonly ArtistRef[];
    readonly soundcloud_url?: string;
    readonly viewable_by_roles?: readonly number[];
    /** Only when their form was opened with `?apple_id=`. */
    readonly match_to_apple_id?: string;
}

/**
 * `POST /songs`, which also creates any album `albums` marks `_new`.
 * @param recaptchaToken Minted by their own page for `create_song`.
 */
export const createSong = async (
    song: CreateSongFields,
    recaptchaToken: string,
): Promise<Result<CreatedSong, WriteFailure>> =>
    (
        await geniusWrite(
            {
                // The token is a sibling of `song`, not one of its fields.
                body: { recaptcha_token: recaptchaToken, song },
                method: "POST",
                path: "/songs",
                what: "the created song",
            },
            createdSchema,
        )
    ).map((answer) => answer.song);

/** One song hit: the title with features, the artists below it. */
const songHitSchema = z.object({
    result: z.object({
        artist_names: z.string().nullish(),
        id: z.number(),
        title: z.string(),
        title_with_featured: z.string().nullish(),
    }),
});

const searchSchema = z.object({
    sections: z
        .array(z.object({ hits: rows(songHitSchema).default([]) }))
        .default([]),
});

/** One song a search found. */
export type SongHit = z.output<typeof songHitSchema>["result"];

/** `GET /search/song?q=`, the search their tracklist editor uses. */
export const searchSongs = async (
    query: string,
): Promise<Result<readonly SongHit[], ReadFailure>> =>
    (
        await geniusRead(
            {
                path: "/search/song",
                query: { q: query },
                what: "a song search",
            },
            searchSchema,
        )
    ).map((answer) =>
        (answer.sections[0]?.hits ?? []).map((hit) => hit.result),
    );

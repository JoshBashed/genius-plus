/** Seeds only: `entities.songs` is thin, with no dates, tags, or credits. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { decodeOr } from "@/utilities/decode";

/** The page's data, not the bundle, is missing something. */
export interface PageError {
    readonly kind: "page";
    readonly target: string;
    readonly reason: string;
}

/** One line naming what the page would not say. */
export const describePageError = (error: PageError): string =>
    `Could not read ${error.target}: ${error.reason}`;

export interface ArtistSeed {
    readonly id: number;
    readonly name: string;
}

export interface TrackSeed {
    readonly songId: number;
    readonly title: string;
    /** `null` on a track Genius itself has no number for. */
    readonly trackNumber: number | null;
    readonly discNumber: number | null;
    readonly url: string | null;
    readonly primaryArtists: readonly ArtistSeed[];
    /** Genius hides songs from unprivileged viewers; worth flagging. */
    readonly hidden: boolean;
}

export interface AlbumSeed {
    readonly albumId: number;
    readonly albumName: string | null;
    readonly tracks: readonly TrackSeed[];
}

/** Their normalizr store, of which only these four slices are read. */
const stateSchema = z.object({
    albumPage: z
        .object({
            album: z.number().nullish(),
            path: z.string().nullish(),
        })
        .nullish(),
    entities: z
        .object({
            albumAppearances: z.record(z.string(), z.unknown()).default({}),
            albums: z.record(z.string(), z.unknown()).default({}),
            artists: z.record(z.string(), z.unknown()).default({}),
            songs: z.record(z.string(), z.unknown()).default({}),
        })
        .default({
            albumAppearances: {},
            albums: {},
            artists: {},
            songs: {},
        }),
});

/** Their ids, with anything that is not one dropped rather than fatal. */
const numberList = z
    .array(z.unknown())
    .default([])
    .transform((rows) =>
        rows.filter((row): row is number => typeof row === "number"),
    );

const albumSchema = z.object({
    name: z.string().nullish(),
    // An album with no songs is a real album, and the one the import has
    // the most to say about, so an empty tracklist is not an error.
    tracklist: numberList,
});

const appearanceSchema = z.object({
    discNumber: z.number().nullish(),
    song: z.number().nullish(),
    trackNumber: z.number().nullish(),
});

const songSchema = z.object({
    hidden: z.boolean().nullish(),
    primaryArtists: numberList,
    title: z.string(),
    url: z.string().nullish(),
});

const artistSchema = z.object({ name: z.string() });

type State = z.output<typeof stateSchema>;

const pageError = (reason: string): Result<never, PageError> =>
    Result.err({ kind: "page", target: "__PRELOADED_STATE__", reason });

/** Appearance ids are *song* ids: normalizr keys them by `song.id`. */
const readAlbumId = (state: State): number | null => {
    const fromSlice = state.albumPage?.album;

    if (fromSlice != null) {
        return fromSlice;
    }

    // A one-album store is unambiguous, so fall back to it.
    const keys = Object.keys(state.entities.albums);
    const only = keys.length === 1 ? keys[0] : undefined;
    const parsed = only === undefined ? Number.NaN : Number(only);

    return Number.isFinite(parsed) ? parsed : null;
};

const readArtists = (
    state: State,
    ids: readonly number[],
): readonly ArtistSeed[] =>
    ids.flatMap((id) => {
        const artist = decodeOr(
            artistSchema,
            state.entities.artists[String(id)],
        );

        return artist === null ? [] : [{ id, name: artist.name }];
    });

const byTrackNumber = (left: TrackSeed, right: TrackSeed): number => {
    const leftDisc = left.discNumber ?? 1;
    const rightDisc = right.discNumber ?? 1;

    if (leftDisc !== rightDisc) {
        return leftDisc - rightDisc;
    }

    // Unnumbered tracks sort last rather than to the top.
    return (
        (left.trackNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.trackNumber ?? Number.MAX_SAFE_INTEGER)
    );
};

/** One appearance, resolved through to the song it places. */
const readTrack = (
    state: State,
    appearanceId: number,
): readonly TrackSeed[] => {
    const appearance = decodeOr(
        appearanceSchema,
        state.entities.albumAppearances[String(appearanceId)],
    );
    // Keyed by song id, but read `song` back out in case that changes.
    const songId = appearance?.song ?? appearanceId;
    const song = decodeOr(songSchema, state.entities.songs[String(songId)]);

    if (song === null) {
        return [];
    }

    return [
        {
            discNumber: appearance?.discNumber ?? null,
            hidden: song.hidden === true,
            primaryArtists: readArtists(state, song.primaryArtists),
            songId,
            title: song.title,
            trackNumber: appearance?.trackNumber ?? null,
            url: song.url ?? null,
        },
    ];
};

/**
 * `__PRELOADED_STATE__` is a server render snapshot that client side
 * navigation never refreshes, so on a second album it still describes
 * the first. Writing against it would edit the wrong album's songs.
 */
const staleFor = (state: State): string | null => {
    const path = state.albumPage?.path;

    if (path == null || path === location.pathname) {
        return null;
    }

    return path;
};

export const readAlbumSeed = (): Result<AlbumSeed, PageError> => {
    const state = decodeOr(
        stateSchema,
        (window as { __PRELOADED_STATE__?: unknown }).__PRELOADED_STATE__,
    );

    if (state === null) {
        return pageError("the page did not expose a preloaded redux state");
    }

    const stale = staleFor(state);

    if (stale !== null) {
        return pageError(
            `the preloaded state still describes ${stale}, not ` +
                `${location.pathname}; reload the page to edit this album`,
        );
    }

    const albumId = readAlbumId(state);

    if (albumId === null) {
        return pageError("no album id in albumPage or entities.albums");
    }

    const album = decodeOr(albumSchema, state.entities.albums[String(albumId)]);
    const tracklist = album?.tracklist ?? [];
    const tracks = tracklist.flatMap((appearanceId) =>
        readTrack(state, appearanceId),
    );

    if (tracks.length === 0 && tracklist.length > 0) {
        return pageError(
            `album ${albumId} lists ${tracklist.length} appearances but ` +
                "none resolved to a song",
        );
    }

    return Result.ok({
        albumId,
        albumName: album?.name ?? null,
        tracks: [...tracks].sort(byTrackNumber),
    });
};

/** Genius album URLs are `/albums/<artist>/<album>`, and only those. */
export const isAlbumUrl = (): boolean =>
    location.pathname.startsWith("/albums/");

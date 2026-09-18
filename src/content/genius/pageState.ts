/** Seeds only: `entities.songs` is thin, with no dates, tags, or credits. */
import { Result } from "@resulted/results";
import type { AppResult } from "@/utilities/result";

const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const at = (value: unknown, key: string): unknown => record(value)?.[key];

const numberAt = (value: unknown, key: string): number | null => {
    const found = at(value, key);
    return typeof found === "number" && Number.isFinite(found) ? found : null;
};

const stringAt = (value: unknown, key: string): string | null => {
    const found = at(value, key);
    return typeof found === "string" ? found : null;
};

const numbersAt = (value: unknown, key: string): readonly number[] => {
    const found = at(value, key);
    return Array.isArray(found)
        ? found.filter((entry): entry is number => typeof entry === "number")
        : [];
};

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

const pageError = (reason: string): AppResult<never> =>
    Result.err({ kind: "page", target: "__PRELOADED_STATE__", reason });

/** Appearance ids are *song* ids: normalizr keys them by `song.id`. */
const readAlbumId = (state: unknown): number | null => {
    const fromSlice = numberAt(at(state, "albumPage"), "album");

    if (fromSlice !== null) {
        return fromSlice;
    }

    // A one-album store is unambiguous, so fall back to it.
    const albums = record(at(at(state, "entities"), "albums"));
    const keys = albums === null ? [] : Object.keys(albums);
    const only = keys.length === 1 ? keys[0] : undefined;
    const parsed = only === undefined ? Number.NaN : Number(only);

    return Number.isFinite(parsed) ? parsed : null;
};

const readArtists = (
    entities: unknown,
    ids: readonly number[],
): readonly ArtistSeed[] => {
    const artists = at(entities, "artists");

    return ids.flatMap((id) => {
        const artist = at(artists, String(id));
        const name = stringAt(artist, "name");
        return name === null ? [] : [{ id, name }];
    });
};

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

/**
 * `__PRELOADED_STATE__` is a server render snapshot that client side
 * navigation never refreshes, so on a second album it still describes
 * the first. Writing against it would edit the wrong album's songs.
 */
const staleFor = (state: unknown): string | null => {
    const path = stringAt(at(state, "albumPage"), "path");

    if (path === null || path === location.pathname) {
        return null;
    }

    return path;
};

export const readAlbumSeed = (): AppResult<AlbumSeed> => {
    const state = (window as { __PRELOADED_STATE__?: unknown })
        .__PRELOADED_STATE__;

    if (record(state) === null) {
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

    const entities = at(state, "entities");
    const album = at(at(entities, "albums"), String(albumId));
    const tracklist = numbersAt(album, "tracklist");

    if (tracklist.length === 0) {
        return pageError(`album ${albumId} has an empty tracklist`);
    }

    const appearances = at(entities, "albumAppearances");
    const songs = at(entities, "songs");

    const tracks = tracklist.flatMap((appearanceId): readonly TrackSeed[] => {
        const appearance = at(appearances, String(appearanceId));
        // Keyed by song id, but read `song` back out in case that changes.
        const songId = numberAt(appearance, "song") ?? appearanceId;
        const song = at(songs, String(songId));
        const title = stringAt(song, "title");

        if (title === null) {
            return [];
        }

        return [
            {
                songId,
                title,
                trackNumber: numberAt(appearance, "trackNumber"),
                discNumber: numberAt(appearance, "discNumber"),
                url: stringAt(song, "url"),
                primaryArtists: readArtists(
                    entities,
                    numbersAt(song, "primaryArtists"),
                ),
                hidden: at(song, "hidden") === true,
            },
        ];
    });

    if (tracks.length === 0) {
        return pageError(
            `album ${albumId} lists ${tracklist.length} appearances but none resolved to a song`,
        );
    }

    return Result.ok({
        albumId,
        albumName: stringAt(album, "name"),
        tracks: [...tracks].sort(byTrackNumber),
    });
};

/** Genius album URLs are `/albums/<artist>/<album>`, and only those. */
export const isAlbumUrl = (): boolean =>
    location.pathname.startsWith("/albums/");

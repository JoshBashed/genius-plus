/** Apple's album catalogue, read through the public iTunes lookup. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { decode, decodeOr } from "./decode";

/** Apple's own host for the lookup, which answers with `ACAO: *`. */
const LOOKUP_URL = "https://itunes.apple.com/lookup";

/** Their cap is 200; no album we can edit comes near it. */
const TRACK_LIMIT = 200;

/** The storefront to read when a URL names none. */
const DEFAULT_STOREFRONT = "us";

export interface AppleAlbumRef {
    readonly albumId: string;
    /** Two letter storefront, which decides titles and release dates. */
    readonly storefront: string;
}

export interface AppleTrack {
    readonly trackId: number;
    readonly title: string;
    readonly trackNumber: number | null;
    readonly discNumber: number | null;
    /** This track's own credit, which on a compilation is not the album's. */
    readonly artistName: string;
    /** ISO-8601, as Apple returns it; the caller takes the date part. */
    readonly releaseDate: string | null;
    readonly genre: string | null;
}

export interface AppleAlbum {
    readonly albumId: string;
    /** The market it was read from; its credits pages are per market. */
    readonly storefront: string;
    readonly title: string;
    readonly artistName: string;
    /** Apple's own thumbnail, whose size lives in the filename. */
    readonly artworkUrl: string | null;
    readonly releaseDate: string | null;
    readonly genre: string | null;
    readonly trackCount: number | null;
    readonly tracks: readonly AppleTrack[];
}

/** A numeric id, with or without Apple's leading `id`. */
const ALBUM_ID = /^(?:id)?(\d{4,})$/;

const storefrontOf = (parts: readonly string[]): string => {
    const index = parts.indexOf("album");
    const found = index > 0 ? parts[index - 1] : undefined;

    return found !== undefined && /^[a-z]{2}$/i.test(found)
        ? found.toLowerCase()
        : DEFAULT_STOREFRONT;
};

/** The pasted text names no album this lookup can read. */
export interface AppleLinkFailure {
    readonly kind: "unreadableLink";
    /** Already a sentence, because it is the only thing shown. */
    readonly reason: string;
}

const unsupported = (reason: string): Result<AppleAlbumRef, AppleLinkFailure> =>
    Result.err({ kind: "unreadableLink", reason });

/**
 * Reads an album out of an Apple Music link, or out of a bare id.
 * @returns The album's id and storefront, so the lookup reads one market.
 */
export const parseAppleAlbumUrl = (
    input: string,
): Result<AppleAlbumRef, AppleLinkFailure> => {
    const trimmed = input.trim();

    if (trimmed === "") {
        return unsupported("Paste an Apple Music album link first");
    }

    const bare = ALBUM_ID.exec(trimmed);

    if (bare?.[1] !== undefined) {
        return Result.ok({
            albumId: bare[1],
            storefront: DEFAULT_STOREFRONT,
        });
    }

    const url = Result.trySync(() => new URL(trimmed));

    if (url.isErr()) {
        return unsupported(`"${trimmed}" is not a link or an album id`);
    }

    const { hostname, pathname } = url.value;

    if (!/(^|\.)(music|itunes)\.apple\.com$/i.test(hostname)) {
        return unsupported(`${hostname} is not an Apple Music link`);
    }

    const parts = pathname.split("/").filter((part) => part !== "");

    if (!parts.includes("album")) {
        return unsupported("That link points at Apple Music, but not an album");
    }

    // Apple puts the id last, after an optional slug; `?i=` names a track.
    const last = parts[parts.length - 1];
    const id = last === undefined ? null : ALBUM_ID.exec(last)?.[1];

    return id === undefined || id === null || id === ""
        ? unsupported("That Apple Music link carries no album id")
        : Result.ok({ albumId: id, storefront: storefrontOf(parts) });
};

/** Their lookup returns the collection and its tracks in one list. */
const collectionSchema = z.object({
    artistName: z.string().optional(),
    artworkUrl100: z.string().optional(),
    collectionName: z.string().optional(),
    primaryGenreName: z.string().optional(),
    releaseDate: z.string().optional(),
    trackCount: z.number().optional(),
    wrapperType: z.literal("collection"),
});

const trackSchema = z.object({
    artistName: z.string().default(""),
    discNumber: z.number().nullable().default(null),
    primaryGenreName: z.string().nullable().default(null),
    releaseDate: z.string().nullable().default(null),
    trackId: z.number(),
    trackName: z.string(),
    trackNumber: z.number().nullable().default(null),
    wrapperType: z.literal("track"),
});

const lookupSchema = z.object({
    results: z.array(z.unknown()),
});

const byTrackNumber = (left: AppleTrack, right: AppleTrack): number => {
    const discs = (left.discNumber ?? 1) - (right.discNumber ?? 1);

    if (discs !== 0) {
        return discs;
    }

    return (
        (left.trackNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.trackNumber ?? Number.MAX_SAFE_INTEGER)
    );
};

/** Blank is how their lookup says absent, so it reads as absent here. */
const present = (value: string | undefined): string | null =>
    value === undefined || value === "" ? null : value;

/**
 * Every way reading one album from Apple fails.
 *
 * Flat by design: nothing here forwards a lower layer's error, and each
 * variant carries only what its own line has to say.
 */
export type AppleAlbumFailure =
    /** The lookup never answered. */
    | { readonly kind: "networkError" }
    /** Apple answered, and what it answered was a refusal. */
    | { readonly kind: "refused"; readonly status: number }
    /** Apple answered with something that is not an album. */
    | { readonly kind: "unreadable"; readonly reason: string };

/** One line naming why an Apple album could not be read. */
export const describeAppleAlbumFailure = (error: AppleAlbumFailure): string => {
    switch (error.kind) {
        case "networkError":
            return "Could not reach Apple's catalogue";
        case "refused":
            return `Apple's catalogue answered ${error.status}`;
        case "unreadable":
            return error.reason;
    }
};

const readAlbum = (
    ref: AppleAlbumRef,
    results: readonly unknown[],
): Result<AppleAlbum, AppleAlbumFailure> => {
    const collection = results.flatMap((entry) => {
        const row = decodeOr(collectionSchema, entry);
        return row === null ? [] : [row];
    })[0];

    if (collection === undefined) {
        return Result.err({
            kind: "unreadable",
            reason: `Apple returned no album for ${ref.albumId}`,
        });
    }

    // A row that does not parse is a kind of entry we do not handle, not
    // a reason to fail the album.
    const tracks: AppleTrack[] = results.flatMap((entry) => {
        const row = decodeOr(trackSchema, entry);

        return row === null
            ? []
            : [
                  {
                      artistName: row.artistName,
                      discNumber: row.discNumber,
                      genre: row.primaryGenreName,
                      releaseDate: row.releaseDate,
                      title: row.trackName,
                      trackId: row.trackId,
                      trackNumber: row.trackNumber,
                  },
              ];
    });

    if (tracks.length === 0) {
        return Result.err({
            kind: "unreadable",
            reason: "Apple listed that album with no songs on it",
        });
    }

    return Result.ok({
        albumId: ref.albumId,
        artistName: collection.artistName ?? "",
        artworkUrl: present(collection.artworkUrl100),
        genre: present(collection.primaryGenreName),
        releaseDate: present(collection.releaseDate),
        storefront: ref.storefront,
        title: collection.collectionName ?? "",
        trackCount: collection.trackCount ?? null,
        tracks: [...tracks].sort(byTrackNumber),
    });
};

/**
 * Fetches one album and its songs from Apple's public lookup.
 * @returns The album, or a `Result` error; this never throws or retries.
 */
export const fetchAppleAlbum = async (
    ref: AppleAlbumRef,
): Promise<Result<AppleAlbum, AppleAlbumFailure>> => {
    const query = new URLSearchParams({
        country: ref.storefront,
        entity: "song",
        id: ref.albumId,
        limit: String(TRACK_LIMIT),
    });
    const url = `${LOOKUP_URL}?${query.toString()}`;
    // No credentials: the lookup is public, and Apple answers `ACAO: *`.
    const response = await Result.try(fetch(url, { method: "GET" }));

    if (response.isErr()) {
        return Result.err({ kind: "networkError" });
    }

    if (!response.value.ok) {
        return Result.err({
            kind: "refused",
            status: response.value.status,
        });
    }

    const text = await Result.try(response.value.text());

    if (text.isErr()) {
        return Result.err({ kind: "networkError" });
    }

    // Apple serves this as `text/javascript`, so it is parsed by hand.
    const parsed = Result.trySync(() => JSON.parse(text.value) as unknown);

    if (parsed.isErr()) {
        return Result.err({
            kind: "unreadable",
            reason: "Apple's answer was not JSON",
        });
    }

    const body = decode(lookupSchema, parsed.value, "Apple's lookup");

    return body.isErr()
        ? Result.err({ kind: "unreadable", reason: body.error.reason })
        : readAlbum(ref, body.value.results);
};

/** Apple sizes artwork in the filename, so any square can be asked for. */
const ARTWORK_SIZE = /\/\d+x\d+bb\./;

/**
 * The same artwork at a different size.
 * @returns The URL unchanged when it is not one Apple sizes that way.
 */
export const appleArtwork = (
    url: string | null,
    size: number,
): string | null =>
    url === null ? null : url.replace(ARTWORK_SIZE, `/${size}x${size}bb.`);

/** Finding the Genius album an Apple album should be imported into. */
import { Result } from "@resulted/results";
import { z } from "zod";
import type { DateComponents } from "@/bindings";
import { decode, decodeOr } from "@/utilities/decode";
import { describeRequestError } from "@/utilities/http";
import { apiGet, type ReadFailure } from "../api";

/**
 * Every way looking an album up on Genius fails.
 *
 * Flat by design: nothing here forwards the API layer's own error, and
 * each variant carries only what its own line has to say.
 */
export type GeniusAlbumFailure =
    /** It never reached Genius. */
    | { readonly kind: "networkError" }
    /** Genius refused it, in its own words. */
    | { readonly kind: "refused"; readonly message: string }
    /** Genius answered with something that is not an album. */
    | { readonly kind: "unreadable"; readonly reason: string };

/** One line naming why an album could not be looked up. */
export const describeGeniusAlbumFailure = (
    error: GeniusAlbumFailure,
): string => {
    switch (error.kind) {
        case "networkError":
            return "The album lookup did not get through";
        case "refused":
            return error.message;
        case "unreadable":
            return `Genius answered with ${error.reason}`;
    }
};

/** Flattens a read failure into what a reader actually needs. */
const asFailure = (error: ReadFailure): GeniusAlbumFailure => {
    if (error.kind === "network") {
        return { kind: "networkError" };
    }

    return error.kind === "http"
        ? { kind: "refused", message: describeRequestError(error) }
        : { kind: "unreadable", reason: error.reason };
};

export interface GeniusAlbum {
    readonly id: number;
    readonly name: string;
    readonly artistName: string | null;
    readonly url: string | null;
    /** Every cover the album already carries, the shown one first. */
    readonly coverArtUrls: readonly string[];
    /** What it already says, so `empty` can leave a set date alone. */
    readonly releaseDate: DateComponents | null;
    /** Their own kind for it: album, ep, single, or mixtape. */
    readonly albumType: string | null;
    /**
     * Whose album this is visible to, carried through a tracklist write.
     * Sending an empty list unconditionally would lift a real restriction.
     */
    readonly viewableByRoles: readonly number[];
}

/** Their album shape, wherever one is returned. */
const albumSchema = z.object({
    album_type: z.string().nullish(),
    artist: z.object({ name: z.string() }).nullish(),
    cover_arts: z
        .array(z.object({ image_url: z.string().nullish() }))
        .nullish(),
    id: z.number(),
    name: z.string(),
    release_date_components: z
        .object({
            day: z.number().nullish(),
            month: z.number().nullish(),
            year: z.number().nullish(),
        })
        .nullish(),
    url: z.string().nullish(),
    viewable_by_roles: z.array(z.number()).nullish(),
});

const autocompleteSchema = z.object({
    albums: z.array(z.unknown()),
});

const oneAlbumSchema = z.object({ album: z.unknown() });

const asAlbum = (parsed: z.output<typeof albumSchema>): GeniusAlbum => ({
    albumType: parsed.album_type ?? null,
    artistName: parsed.artist?.name ?? null,
    coverArtUrls: (parsed.cover_arts ?? []).flatMap((art) =>
        art.image_url === undefined || art.image_url === null
            ? []
            : [art.image_url],
    ),
    id: parsed.id,
    name: parsed.name,
    releaseDate:
        parsed.release_date_components === undefined ||
        parsed.release_date_components === null
            ? null
            : {
                  day: parsed.release_date_components.day ?? null,
                  month: parsed.release_date_components.month ?? null,
                  year: parsed.release_date_components.year ?? null,
              },
    url: parsed.url ?? null,
    viewableByRoles: parsed.viewable_by_roles ?? [],
});

/** `GET /albums/autocomplete?q=`, the same list their own search uses. */
export const searchGeniusAlbums = async (
    query: string,
): Promise<Result<readonly GeniusAlbum[], GeniusAlbumFailure>> => {
    const response = await apiGet("/albums/autocomplete", { q: query });

    if (response.isErr()) {
        return Result.err(asFailure(response.error));
    }

    const rows = decode(
        autocompleteSchema,
        response.value,
        "the album autocomplete",
    );

    if (rows.isErr()) {
        return Result.err({ kind: "unreadable", reason: rows.error.reason });
    }

    // A row that does not parse is one we cannot name, not a failure.
    return Result.ok(
        rows.value.albums.flatMap((row) => {
            const album = decodeOr(albumSchema, row);
            return album === null ? [] : [asAlbum(album)];
        }),
    );
};

/** `GET /albums/:id`, for the album an editor link already named. */
export const loadGeniusAlbum = async (
    albumId: number,
): Promise<Result<GeniusAlbum, GeniusAlbumFailure>> => {
    const response = await apiGet(`/albums/${albumId}`);

    if (response.isErr()) {
        return Result.err(asFailure(response.error));
    }

    const body = decode(oneAlbumSchema, response.value, `album ${albumId}`);

    if (body.isErr()) {
        return Result.err({ kind: "unreadable", reason: body.error.reason });
    }

    return decode(albumSchema, body.value.album, `album ${albumId}`)
        .map(asAlbum)
        .mapErr(
            (error): GeniusAlbumFailure => ({
                kind: "unreadable",
                reason: error.reason,
            }),
        );
};

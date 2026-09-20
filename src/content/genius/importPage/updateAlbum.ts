/** The album's own record: its art, its date, its language, its kind. */
import { Result } from "@resulted/results";
import type { DateComponents } from "@/bindings";
import { describeRequestError } from "@/utilities/http";
import { apiPut, type WriteFailure } from "../api";

/** Their four kinds, as their own editor offers them. */
export type AlbumType = "album" | "ep" | "single" | "mixtape";

/** One cover, by the URL whatever hosted it answered with. */
export interface CoverArt {
    readonly image_url: string;
}

/** Everything `PUT /albums/:id` takes that this import ever sets. */
export interface AlbumFields {
    readonly cover_arts?: readonly CoverArt[];
    readonly release_date_components?: DateComponents | null;
    /** Genius's own code, such as `"zh-Hant"`. */
    readonly language?: string;
    readonly album_type?: AlbumType;
}

/** Every way updating the album can fail, and nothing more. */
export type UpdateAlbumFailure =
    | { readonly kind: "networkError"; readonly url: string }
    | {
          readonly kind: "refused";
          readonly status: number;
          readonly message: string;
      };

const asFailure = (error: WriteFailure): UpdateAlbumFailure => {
    if (error.kind === "network") {
        return { kind: "networkError", url: error.url };
    }

    return error.kind === "http"
        ? {
              kind: "refused",
              message: describeRequestError(error),
              status: error.status,
          }
        : { kind: "refused", message: error.reason, status: 0 };
};

/** One line for whatever stopped the album being updated. */
export const describeUpdateAlbumFailure = (
    error: UpdateAlbumFailure,
): string =>
    error.kind === "networkError"
        ? `Could not reach ${error.url}`
        : error.message;

/**
 * Writes the album's own fields, leaving every one not named alone.
 * @returns Nothing of use; the caller re-reads if it wants the record.
 */
export const updateAlbum = async (
    albumId: number,
    fields: AlbumFields,
): Promise<Result<null, UpdateAlbumFailure>> => {
    const written = await apiPut(`/albums/${albumId}`, { album: fields });

    return written.isErr()
        ? Result.err(asFailure(written.error))
        : Result.ok(null);
};

/** The album's own record: its art, its date, its language, its kind. */
import { Result } from "@resulted/results";
import * as geniusApi from "@/content/genius/geniusApi";
import { describeRequestError } from "@/utilities/http";

/** Every way updating the album can fail, and nothing more. */
export type UpdateAlbumFailure =
    | { readonly kind: "networkError"; readonly url: string }
    | {
          readonly kind: "refused";
          readonly status: number;
          readonly message: string;
      };

const asFailure = (error: geniusApi.WriteFailure): UpdateAlbumFailure => {
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
    fields: geniusApi.AlbumFields,
): Promise<Result<null, UpdateAlbumFailure>> => {
    const written = await geniusApi.updateAlbum(albumId, fields);

    return written.isErr()
        ? Result.err(asFailure(written.error))
        : Result.ok(null);
};

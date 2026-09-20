/** The album's covers, which `PUT /albums/:id` takes as a whole set. */
import { Result } from "@resulted/results";
import { appleArtwork } from "@/utilities/appleAlbum";
import {
    appleMusicCandidates,
    describeImageError,
    resolveArtwork,
    sanitizeFilename,
} from "@/utilities/artwork";
import type { ImportedAlbum } from "../albumImport/importedAlbum";
import { describeFilepickerFailure, uploadImage } from "./filepicker";
import type { CoverArt } from "./updateAlbum";

/** Apple upscales rather than clamping, so this is asked for, not forced. */
const ARTWORK_SIZE = 1000;

/**
 * Every way the album's cover does not get set.
 *
 * Flat by design: nothing here forwards a lower layer's error, and each
 * variant carries only what its own line has to say.
 */
export type CoverArtFailure =
    /** Apple's artwork never downloaded or never decoded. */
    | { readonly kind: "artworkUnread"; readonly reason: string }
    /** It decoded, and Filestack would not store it. */
    | { readonly kind: "notUploaded"; readonly reason: string };

/** One line naming why an album kept the cover it had. */
export const describeCoverArtFailure = (error: CoverArtFailure): string =>
    error.kind === "artworkUnread"
        ? `Apple's artwork could not be read: ${error.reason}`
        : `The cover was not uploaded: ${error.reason}`;

/**
 * The covers to write, the new one first, or `null` to write none.
 *
 * `cover_arts` replaces the whole set: a cover left out of the write is
 * a cover deleted, and index 0 is the one shown. So every cover the
 * album already carries is carried through behind the new one.
 *
 * @param existing The album's own covers, re-read, the shown one first.
 */
const planCoverArts = (
    existing: readonly string[],
    uploaded: string,
): readonly CoverArt[] =>
    [uploaded, ...existing.filter((url) => url !== uploaded)].map(
        (image_url) => ({ image_url }),
    );

/**
 * Whether this import sets the cover at all.
 * An album that already has one keeps it unless the reader asked for
 * every field to be written.
 */
export const wantsCoverArt = (
    existing: readonly string[],
    artworkUrl: string | null,
    mode: "empty" | "all",
): boolean => artworkUrl !== null && (mode === "all" || existing.length === 0);

/**
 * Downloads Apple's artwork, stores it on Filestack, and plans the set.
 *
 * @returns The covers to write, or why the album keeps the ones it has.
 */
export const uploadCoverArt = async (
    album: ImportedAlbum,
    existing: readonly string[],
): Promise<Result<readonly CoverArt[], CoverArtFailure>> => {
    const sized = appleArtwork(album.artworkUrl, ARTWORK_SIZE);

    if (sized === null) {
        return Result.err({
            kind: "artworkUnread",
            reason: "Apple listed this album with no artwork",
        });
    }

    // Their PNG first, then the JPEG beside it; either way what comes
    // back is re-encoded as a PNG, which is what Genius has to store.
    const artwork = await resolveArtwork(appleMusicCandidates(sized));

    if (artwork.isErr()) {
        return Result.err({
            kind: "artworkUnread",
            reason: describeImageError(artwork.error),
        });
    }

    const filename = `${sanitizeFilename(album.title)}.png`;
    const uploaded = await uploadImage(artwork.value.blob, filename);

    return uploaded.isErr()
        ? Result.err({
              kind: "notUploaded",
              reason: describeFilepickerFailure(uploaded.error),
          })
        : Result.ok(planCoverArts(existing, uploaded.value));
};

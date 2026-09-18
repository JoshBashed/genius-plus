import { Result } from "@resulted/results";
import { sendMessage } from "./messaging";
import type { AppError, AppResult } from "./result";

/** An image that downloaded and decoded, re-encoded as a PNG. */
export interface DecodedArtwork {
    readonly blob: Blob;
    readonly width: number;
    readonly height: number;
    /** The candidate URL that actually worked. */
    readonly sourceUrl: string;
}

/* ---------------------------------------------------------------- */
/* Candidate URLs                                                    */
/* ---------------------------------------------------------------- */

const stripQuery = (url: string): string => url.split(/[?#]/)[0] ?? url;

/** Apple's size transform. It upscales rather than clamping. */
const APPLE_TRANSFORM = /\/\d+x\d+[a-z]{0,3}(?:-\d+)?\.(?:jpe?g|png|webp)$/i;

/** Comfortably above the 1000x1000 Genius shows cover art at. */
const APPLE_SIZE = 1024;

/**
 * Candidate URLs for a piece of Apple Music artwork.
 * @returns A 1024px PNG request first, then `raw` unchanged.
 */
export const appleMusicCandidates = (raw: string): string[] => {
    const url = stripQuery(raw);

    if (!APPLE_TRANSFORM.test(url)) {
        return [url];
    }

    const base = url.slice(0, url.lastIndexOf("/"));

    return [`${base}/${APPLE_SIZE}x${APPLE_SIZE}bb.png`, url];
};

/** SoundCloud names the size in the filename; `-original` is the master. */
const SOUNDCLOUD_SIZE =
    /-(?:original|t?\d+x\d+|large|badge|small|tiny|mini|crop)(\.(?:jpe?g|png|webp))$/i;

/**
 * Candidate URLs for a piece of SoundCloud artwork.
 * @returns `-original` first, then smaller sizes, then `raw` unchanged.
 */
export const soundcloudCandidates = (raw: string): string[] => {
    const url = stripQuery(raw);
    const match = SOUNDCLOUD_SIZE.exec(url);

    if (match === null) {
        return [url];
    }

    const base = url.slice(0, match.index);
    const ext = match[1] ?? ".jpg";

    return [
        `${base}-original${ext}`,
        `${base}-t1080x1080${ext}`,
        `${base}-t500x500${ext}`,
        url,
    ];
};

/* ---------------------------------------------------------------- */
/* Fetching and decoding                                             */
/* ---------------------------------------------------------------- */

/**
 * Fetches from the page, then the worker, which is not bound by CORS.
 * @returns The image bytes, or an `http` error when the CDN answered.
 */
export const fetchImage = async (url: string): Promise<AppResult<Blob>> => {
    const direct = await Result.try(
        fetch(url, { credentials: "omit", mode: "cors" }),
    );

    if (direct.isOk()) {
        if (!direct.value.ok) {
            // A real HTTP status means the worker would say the same.
            return Result.err({
                kind: "http",
                status: direct.value.status,
                url,
            });
        }

        const blob = await Result.try(direct.value.blob());

        if (blob.isOk()) {
            return Result.ok(blob.value);
        }
    }

    const relayed = await sendMessage({ type: "image:fetch", url });

    if (relayed.isErr()) {
        return Result.err(relayed.error);
    }

    const decoded = await Result.try(
        fetch(relayed.value).then((response) => response.blob()),
    );

    return decoded.isOk()
        ? Result.ok(decoded.value)
        : Result.err({ kind: "network", url });
};

/**
 * Re-encodes an image blob as a PNG at its native resolution.
 * @param sourceUrl Recorded on the result as the URL that worked.
 * @returns The PNG and its pixel size, or a `decode` error.
 */
export const toPng = async (
    blob: Blob,
    sourceUrl: string,
): Promise<AppResult<DecodedArtwork>> => {
    const bitmap = await Result.try(createImageBitmap(blob));

    if (bitmap.isErr()) {
        return Result.err({
            kind: "decode",
            reason: "the CDN returned something that is not an image",
        });
    }

    const { height, width } = bitmap.value;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");

    if (context === null) {
        bitmap.value.close();
        return Result.err({
            kind: "decode",
            reason: "no 2d canvas context is available",
        });
    }

    context.drawImage(bitmap.value, 0, 0);
    bitmap.value.close();

    const png = await Result.try(canvas.convertToBlob({ type: "image/png" }));

    return png.isOk()
        ? Result.ok({ blob: png.value, height, sourceUrl, width })
        : Result.err({ kind: "decode", reason: "PNG encoding failed" });
};

/**
 * Tries `candidates` in order and stops at the first success.
 * @param candidates URLs in descending quality order.
 * @returns The first artwork that decoded, or the last error seen.
 */
export const resolveArtwork = async (
    candidates: readonly string[],
): Promise<AppResult<DecodedArtwork>> => {
    let lastError: AppError = {
        kind: "unsupported",
        reason: "no artwork URL could be derived from this element",
    };

    for (const candidate of candidates) {
        const blob = await fetchImage(candidate);

        if (blob.isErr()) {
            lastError = blob.error;
            continue;
        }

        const png = await toPng(blob.value, candidate);

        if (png.isOk()) {
            return png;
        }

        lastError = png.error;
    }

    return Result.err(lastError);
};

/* ---------------------------------------------------------------- */
/* Saving                                                            */
/* ---------------------------------------------------------------- */

/**
 * Strips path separators and collapses whitespace, to 120 characters.
 * @returns The cleaned name, or `"artwork"` when nothing is left.
 */
export const sanitizeFilename = (name: string): string => {
    const cleaned = name
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);

    return cleaned === "" ? "artwork" : cleaned;
};

/**
 * Saves through an anchor, which avoids the `downloads` permission.
 * @param filename Offered to the browser; include the extension.
 */
export const saveBlob = (blob: Blob, filename: string): void => {
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = href;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(href), 60_000);
};

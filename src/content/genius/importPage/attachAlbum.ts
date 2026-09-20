/** Putting a song on a new album, which is how an album gets created. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { decodeOr } from "@/utilities/decode";
import { describeRequestError } from "@/utilities/http";
import { apiGet, apiPut, type WriteFailure } from "../api";
import type { GeniusAlbum } from "./geniusAlbums";

/**
 * Every way attaching a song to an album fails.
 *
 * Flat by design: nothing here forwards the API layer's own error, and
 * each variant carries only what its own line has to say.
 */
export type AttachFailure =
    /** It never reached Genius. */
    | { readonly kind: "networkError" }
    /** Genius refused it, in its own words. */
    | { readonly kind: "refused"; readonly message: string }
    /** Genius took the write, and its answer names no such album. */
    | { readonly kind: "unreadable"; readonly reason: string };

/** One line naming why a song is not on the album yet. */
export const describeAttachFailure = (error: AttachFailure): string => {
    switch (error.kind) {
        case "networkError":
            return "The request did not get through";
        case "refused":
            return error.message;
        case "unreadable":
            return error.reason;
    }
};

/** Flattens a write failure into what a reader actually needs. */
const asFailure = (error: WriteFailure): AttachFailure => {
    switch (error.kind) {
        case "network":
            return { kind: "networkError" };
        case "http":
            return { kind: "refused", message: describeRequestError(error) };
        case "auth":
            return { kind: "refused", message: error.reason };
        case "decode":
            return { kind: "unreadable", reason: error.reason };
    }
};

/** Their album shape as a song lists it, which carries no artist. */
const albumSchema = z.object({
    id: z.number(),
    name: z.string(),
    url: z.string().nullish(),
});

/** A song answer, of which only its albums are read. */
const songSchema = z.object({
    song: z.object({ albums: z.array(z.unknown()).default([]) }).nullish(),
});

const asAlbum = (parsed: z.output<typeof albumSchema>): GeniusAlbum => ({
    albumType: null,
    artistName: null,
    // A song's own listing carries none of this; the import re-reads
    // the album's own record before it writes anything to it.
    coverArtUrls: [],
    id: parsed.id,
    name: parsed.name,
    releaseDate: null,
    url: parsed.url ?? null,
    viewableByRoles: [],
});

/** The albums in one song answer; a row we cannot read is dropped. */
const albumsOf = (body: unknown): readonly GeniusAlbum[] => {
    const parsed = decodeOr(songSchema, body);

    return (parsed?.song?.albums ?? []).flatMap((row) => {
        const album = decodeOr(albumSchema, row);

        return album === null ? [] : [asAlbum(album)];
    });
};

const sameName = (left: string, right: string): boolean =>
    left.trim().toLowerCase() === right.trim().toLowerCase();

/**
 * The albums a song is already on.
 *
 * A song that is on one names the album this import belongs to, which
 * beats searching for it by name and beats creating a second one.
 */
export const songAlbums = async (
    songId: number,
): Promise<Result<readonly GeniusAlbum[], AttachFailure>> => {
    const song = await apiGet(`/songs/${songId}`);

    return song.isErr()
        ? Result.err(asFailure(song.error))
        : Result.ok(albumsOf(song.value));
};

/**
 * Adds a song to an album Genius does not have yet, creating it.
 *
 * `PUT /songs/:id` replaces the whole `albums` list, so the song's
 * current albums are read first and sent back with the new one. Without
 * that, putting a song on a new album would take it off every other.
 *
 * @returns The album Genius created, found by name in its own answer.
 */
export const attachToNewAlbum = async (
    songId: number,
    albumName: string,
): Promise<Result<GeniusAlbum, AttachFailure>> => {
    const current = await apiGet(`/songs/${songId}`);

    if (current.isErr()) {
        return Result.err(asFailure(current.error));
    }

    const existing = albumsOf(current.value);
    const already = existing.find((album) => sameName(album.name, albumName));

    // Already where it needs to be, so nothing is written.
    if (already !== undefined) {
        return Result.ok(already);
    }

    // `_new` is their own marker for an album to bring into being.
    // Without it Genius is free to name-match instead, which puts the
    // song on somebody else's album of the same name.
    const written = await apiPut(`/songs/${songId}`, {
        song: {
            albums: [
                ...existing.map((album) => ({ id: album.id })),
                { _new: true, name: albumName.trim() },
            ],
        },
    });

    if (written.isErr()) {
        return Result.err(asFailure(written.error));
    }

    const created = albumsOf(written.value).find((album) =>
        sameName(album.name, albumName),
    );

    return created === undefined
        ? Result.err({
              kind: "unreadable",
              reason:
                  "Genius took the write but listed no album called " +
                  `"${albumName}"`,
          })
        : Result.ok(created);
};

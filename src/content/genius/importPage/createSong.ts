/** The body their Add A Song form posts, built from what we imported. */

import { Result } from "@resulted/results";
import type { SelectOption } from "@/bindings";
import type { ContributorPlan } from "@/content/genius/albumImport/contributors";
import { creditOptions } from "@/content/genius/albumImport/contributors";
import type { ImportedAlbum } from "@/content/genius/albumImport/importedAlbum";
import type { GeniusAlbum } from "@/content/genius/importPage/geniusAlbums";
import * as geniusApi from "@/content/genius/utilities/geniusApi";
import { optionToRef } from "@/content/genius/utilities/options";
import { describeRequestError } from "@/utilities/http";
import { log } from "@/utilities/log";

/**
 * What goes on the wire.
 * The token is a sibling of `song`, not one of its fields, and is minted
 * by their own page for the action `create_song`.
 */
export interface CreateSongBody {
    readonly song: geniusApi.CreateSongFields;
    readonly recaptcha_token: string;
}

/** Their own shape: the name travels with the id, never without it. */
const refs = (
    options: readonly SelectOption[],
): readonly geniusApi.ArtistRef[] =>
    options.map((option) => {
        const ref = optionToRef(option);

        return ref.id === null
            ? { name: ref.name }
            : { id: ref.id, name: ref.name };
    });

/**
 * The request that would create an album's first song.
 *
 * @param title The song's name, which also decides nothing else: the
 * album is created as a side effect of naming it here.
 * @param primaryTag The tag the reader chose, id and name both: their
 * form sends the name alongside, and mirrors it into `tags`.
 */
export const createSongFields = (
    album: ImportedAlbum,
    artists: ContributorPlan,
    title: string,
    primaryTag: geniusApi.TagRef | null,
    albumName: string,
): geniusApi.CreateSongFields => {
    const first = album.tracks[0];

    return {
        // `_new` is how their form says this album does not exist yet.
        albums: [{ _new: true, name: albumName }],
        lyrics: "",
        lyrics_state: "incomplete",
        primary_artists: refs(
            creditOptions(artists, first?.primaryCredit ?? ""),
        ),
        primary_tag_id: primaryTag?.id ?? null,
        release_date_components: first?.releaseDate ?? null,
        // Their form mirrors the primary tag into the tag list, locked.
        ...(primaryTag === null
            ? {}
            : { tags: [{ ...primaryTag, isLocked: true as const }] }),
        title: title.trim(),
    };
};

/**
 * Creates the song, and with it the album its `albums` names.
 *
 * The body's `recaptcha_token` is the caller's to obtain: their endpoint
 * wants one minted by their own page for the action `create_song`, and
 * nothing here produces it.
 *
 * @returns The created song, or why it was refused. A refusal about
 * named fields is kept apart from one about the request, because the two
 * are shown very differently.
 */
export const createSong = async (
    body: CreateSongBody,
): Promise<Result<CreatedSong, CreateSongFailure>> => {
    const answer = await geniusApi.createSong(body.song, body.recaptcha_token);

    if (answer.isErr()) {
        // The body is the only way to tell a rejected shape from a
        // rejected value, and a 500 says nothing on its own.
        log.warn("genius: create song refused", JSON.stringify(body));

        return Result.err(asFailure(answer.error));
    }

    return Result.ok(asCreatedSong(answer.value));
};

/** The song their create call answers with, once it has made one. */
export interface CreatedSong {
    readonly songId: number;
    readonly title: string;
    /** Where their own flow sends the browser next. */
    readonly url: string | null;
    /**
     * The albums it was created on, the new one among them.
     *
     * Read from this answer rather than from the song afterwards: a
     * `GET` sent straight after the `POST` can come back before the
     * album is on the record, and then nothing has made the album.
     */
    readonly albums: readonly GeniusAlbum[];
}

/**
 * Every way creating a song can fail.
 *
 * Flat by design: none of these forwards the failure underneath it, and
 * each carries exactly what its own message needs to say, so a reader is
 * told what happened without a caller unpacking someone else's error.
 */
export type CreateSongFailure =
    /** It never reached Genius. */
    | { readonly kind: "networkError"; readonly url: string }
    /** Genius refused it, in its own words. */
    | {
          readonly kind: "refused";
          readonly status: number;
          readonly message: string;
      }
    /** Genius refused it, and named the fields. */
    | {
          readonly kind: "validationError";
          readonly errors: geniusApi.ValidationErrors;
      }
    /** Genius took it and answered with something that is not a song. */
    | { readonly kind: "unreadable"; readonly reason: string };

/** The song their create call answered with, in our own shape. */
const asCreatedSong = (song: geniusApi.CreatedSong): CreatedSong => ({
    albums: song.albums.map((entry) => ({
        albumType: null,
        artistName: null,
        // The answer carries none of this, and the import re-reads the
        // album's own record before it writes anything to it.
        coverArtUrls: [],
        id: entry.id,
        name: entry.name,
        releaseDate: null,
        url: entry.url ?? null,
        viewableByRoles: [],
    })),
    songId: song.id,
    title: song.title,
    url: song.url ?? null,
});

/** Flattens a write failure into what a reader actually needs. */
const asFailure = (error: geniusApi.WriteFailure): CreateSongFailure => {
    if (error.kind === "network") {
        return { kind: "networkError", url: error.url };
    }

    if (error.kind === "http") {
        const fields = error.validationErrors ?? {};

        return Object.keys(fields).length > 0
            ? { errors: fields, kind: "validationError" }
            : {
                  kind: "refused",
                  message: describeRequestError(error),
                  status: error.status,
              };
    }

    if (error.kind === "auth") {
        // No CSRF token, which is Genius refusing before it is asked.
        return { kind: "refused", message: error.reason, status: 0 };
    }

    return { kind: "unreadable", reason: error.reason };
};

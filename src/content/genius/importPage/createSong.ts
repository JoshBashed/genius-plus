/** The body their Add A Song form posts, built from what we imported. */

import { Result } from "@resulted/results";
import { z } from "zod";
import type { DateComponents, SelectOption } from "@/bindings";
import { type DecodeFailure, decode } from "@/utilities/decode";
import { describeRequestError } from "@/utilities/http";
import { log } from "@/utilities/log";

import type { ContributorPlan } from "../albumImport/contributors";
import { creditOptions } from "../albumImport/contributors";
import type { ImportedAlbum } from "../albumImport/importedAlbum";
import type { ValidationErrors } from "../api";
import { apiPost, type WriteFailure } from "../api";
import { optionToRef } from "../options";
import type { GeniusAlbum } from "./geniusAlbums";

/** The three states their editor can create a song in. */
export type LyricsState = "complete" | "incomplete" | "unreleased";

/**
 * Their lyrics, as the wire carries them.
 *
 * Their client only transforms the string when it is not empty, so a
 * song created without lyrics really does post `""`; a non-empty one
 * goes through `eo = e => _t(bt(e, {}))` into their own DOM tree, whose
 * shape is unmeasured.
 */
export type LyricsBody = unknown;

/** An artist as their form sends one: the id, and the name beside it. */
export type ArtistRef = {
    readonly id?: number;
    readonly name: string;
};

/** An album, with the marker their form sets on one it is creating. */
export type AlbumRef = {
    readonly id?: number;
    readonly name: string;
    readonly _new?: true;
};

/** A tag, as their form mirrors the primary one into the tag list. */
export type TagRef = {
    readonly id: number;
    readonly name: string;
    readonly isLocked?: true;
};

/**
 * The fields their Add A Song form actually posts.
 *
 * Read off a real request, not inferred: it sends eight keys and leaves
 * every empty one out entirely, so the optional ones here are omitted
 * rather than sent blank.
 */
export interface CreateSongFields {
    readonly title: string;
    readonly primary_artists: readonly ArtistRef[];
    readonly albums: readonly AlbumRef[];
    readonly primary_tag_id: number | null;
    /** Their form mirrors the primary tag into this list. */
    readonly tags?: readonly TagRef[];
    readonly release_date_components: DateComponents | null;
    readonly lyrics: LyricsBody;
    readonly lyrics_state: LyricsState;
    readonly featured_artists?: readonly ArtistRef[];
    readonly producer_artists?: readonly ArtistRef[];
    readonly writer_artists?: readonly ArtistRef[];
    readonly soundcloud_url?: string;
    readonly viewable_by_roles?: readonly number[];
    /** Only when their form was opened with `?apple_id=`. */
    readonly match_to_apple_id?: string;
}

/**
 * What goes on the wire.
 * The token is a sibling of `song`, not one of its fields, and is minted
 * by their own page for the action `create_song`.
 */
export interface CreateSongBody {
    readonly song: CreateSongFields;
    readonly recaptcha_token: string;
}

/** Their own shape: the name travels with the id, never without it. */
const refs = (options: readonly SelectOption[]): readonly ArtistRef[] =>
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
    primaryTag: TagRef | null,
    albumName: string,
): CreateSongFields => {
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
    const answer = await apiPost("/songs", body);

    if (answer.isErr()) {
        // The body is the only way to tell a rejected shape from a
        // rejected value, and a 500 says nothing on its own.
        log.warn("genius: create song refused", JSON.stringify(body));

        return Result.err(asFailure(answer.error));
    }

    // It answered; whether it answered with a song is another question.
    const created = readCreatedSong(answer.value);

    return created.isErr()
        ? Result.err({ kind: "unreadable", reason: created.error.reason })
        : Result.ok(created.value);
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

const createdSchema = z.object({
    song: z.object({
        albums: z
            .array(
                z.object({
                    id: z.number(),
                    name: z.string(),
                    url: z.string().nullish(),
                }),
            )
            .nullish(),
        id: z.number(),
        title: z.string(),
        url: z.string().nullish(),
    }),
});

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
    | { readonly kind: "validationError"; readonly errors: ValidationErrors }
    /** Genius took it and answered with something that is not a song. */
    | { readonly kind: "unreadable"; readonly reason: string };

/**
 * Reads the song out of a create call's answer.
 * @returns The created song, or why the answer was not one.
 */
export const readCreatedSong = (
    body: unknown,
): Result<CreatedSong, DecodeFailure> =>
    decode(createdSchema, body, "the created song").map((parsed) => ({
        albums: (parsed.song.albums ?? []).map((entry) => ({
            albumType: null,
            artistName: null,
            // The answer carries none of this, and the import re-reads
            // the album's own record before it writes anything to it.
            coverArtUrls: [],
            id: entry.id,
            name: entry.name,
            releaseDate: null,
            url: entry.url ?? null,
            viewableByRoles: [],
        })),
        songId: parsed.song.id,
        title: parsed.song.title,
        url: parsed.song.url ?? null,
    }));

/** Flattens a write failure into what a reader actually needs. */
const asFailure = (error: WriteFailure): CreateSongFailure => {
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

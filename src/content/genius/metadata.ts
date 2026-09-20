/** The ten editable fields, fetched because the page carries none. */
import { Result } from "@resulted/results";
import { z } from "zod";
import type { DateComponents } from "@/bindings";
import { decode, decodeOr } from "@/utilities/decode";
import { apiGet, type ReadFailure } from "./api";
import { drain } from "./pool";

/** A credit; `id` is `null` for a value Genius has never seen. */
export interface NamedRef {
    readonly id: number | null;
    readonly name: string;
}

export interface SongMetadata {
    readonly songId: number;
    readonly title: string;
    readonly primaryArtists: readonly NamedRef[];
    readonly featuredArtists: readonly NamedRef[];
    readonly writerArtists: readonly NamedRef[];
    readonly producerArtists: readonly NamedRef[];
    readonly releaseDate: DateComponents;
    /** An ISO-ish language code, as Genius stores it (`"en"`, `"pt"`). */
    readonly language: string | null;
    readonly primaryTag: NamedRef | null;
    readonly tags: readonly NamedRef[];
    readonly soundcloudUrl: string | null;
    readonly youtubeUrl: string | null;
    /** `null` when absent or empty, both meaning unknown rather than denied. */
    readonly permissions: readonly string[] | null;
    /** Only ever `true` when Genius said so; absent reads as not locked. */
    readonly published: boolean;
}

export const EMPTY_DATE: DateComponents = {
    year: null,
    month: null,
    day: null,
};

/** A credit; Genius omits `id` for a value it has never seen. */
const refSchema = z.object({
    id: z.number().nullish(),
    name: z.string(),
});

const dateSchema = z
    .object({
        day: z.number().nullish(),
        month: z.number().nullish(),
        year: z.number().nullish(),
    })
    .nullish();

/** Blank is how their API says absent, so it reads as absent here. */
const presentString = z
    .string()
    .nullish()
    .transform((value) => (value === undefined || value === "" ? null : value));

const refs = z
    .array(z.unknown())
    .default([])
    .transform((rows) =>
        rows.flatMap((row): readonly NamedRef[] => {
            const ref = decodeOr(refSchema, row);

            return ref === null ? [] : [{ id: ref.id ?? null, name: ref.name }];
        }),
    );

const songSchema = z.object({
    current_user_metadata: z
        .object({ permissions: z.array(z.string()).nullish() })
        .nullish(),
    featured_artists: refs,
    id: z.number(),
    language: presentString,
    primary_artists: refs,
    primary_tag: refSchema.nullish(),
    producer_artists: refs,
    published: z.boolean().nullish(),
    release_date_components: dateSchema,
    soundcloud_url: presentString,
    tags: refs,
    title: z.string(),
    writer_artists: refs,
    youtube_url: presentString,
});

const answerSchema = z.object({ song: z.unknown() });

const asMetadata = (song: z.output<typeof songSchema>): SongMetadata => {
    const permissions = song.current_user_metadata?.permissions ?? [];

    return {
        featuredArtists: song.featured_artists,
        // The album wide call ships the key with nothing in it, and an
        // empty list means unknown rather than denied.
        permissions: permissions.length === 0 ? null : permissions,
        primaryArtists: song.primary_artists,
        primaryTag:
            song.primary_tag == null
                ? null
                : {
                      id: song.primary_tag.id ?? null,
                      name: song.primary_tag.name,
                  },
        producerArtists: song.producer_artists,
        // Only an explicit `true` locks: absent means unknown, not locked.
        published: song.published === true,
        releaseDate: {
            day: song.release_date_components?.day ?? null,
            month: song.release_date_components?.month ?? null,
            year: song.release_date_components?.year ?? null,
        },
        songId: song.id,
        soundcloudUrl: song.soundcloud_url,
        tags: song.tags,
        title: song.title,
        writerArtists: song.writer_artists,
        youtubeUrl: song.youtube_url,
        language: song.language,
    };
};

/**
 * Every way one song's record fails to arrive.
 *
 * Flat by design: nothing here forwards the API layer's own error, and
 * each variant carries only what the row's one line has to say.
 */
export type MetadataFailure =
    /** It never reached Genius. */
    | { readonly kind: "networkError" }
    /** Genius answered, and what it answered was a refusal. */
    | { readonly kind: "refused"; readonly status: number }
    /** Genius answered with something that is not a song. */
    | { readonly kind: "unreadable" };

/** The per-field summary a failed row shows, kept short enough to fit. */
export const describeMetadataFailure = (error: MetadataFailure): string => {
    switch (error.kind) {
        case "networkError":
            return "The request did not get through";
        case "refused":
            return `Genius answered ${error.status}`;
        case "unreadable":
            return "The answer was not the shape we expected";
    }
};

/** Flattens a read failure into what a row actually needs. */
const asFailure = (error: ReadFailure): MetadataFailure =>
    error.kind === "network"
        ? { kind: "networkError" }
        : error.kind === "http"
          ? { kind: "refused", status: error.status }
          : { kind: "unreadable" };

export const loadSongMetadata = async (
    songId: number,
): Promise<Result<SongMetadata, MetadataFailure>> => {
    const response = await apiGet(`/songs/${songId}`);

    if (response.isErr()) {
        return Result.err(asFailure(response.error));
    }

    const body = decode(answerSchema, response.value, `song ${songId}`);

    if (body.isErr()) {
        return Result.err({ kind: "unreadable" });
    }

    return decode(songSchema, body.value.song, `song ${songId}`)
        .map(asMetadata)
        .mapErr((): MetadataFailure => ({ kind: "unreadable" }));
};

/** Four at a time: enough to hide the latency, polite enough to ship. */
const CONCURRENCY = 4;

export type MetadataSink = (
    songId: number,
    result: Result<SongMetadata, MetadataFailure>,
) => void;

/**
 * Emits each song through `sink` as it arrives. Never rejects.
 * The album-wide call is deliberately unused: it returns a 21 key song that
 * omits `soundcloud_url`, `youtube_url`, and `published`, and leaves
 * `permissions` empty.
 */
export const loadAlbumMetadata = async (
    songIds: readonly number[],
    sink: MetadataSink,
): Promise<void> => {
    await drain(songIds, CONCURRENCY, async (songId) => {
        const result = await loadSongMetadata(songId);

        // A throwing sink is the caller's bug; it cannot become ours.
        Result.trySync(() => {
            sink(songId, result);
        });
    });
};

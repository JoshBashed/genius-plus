/** The ten editable fields, fetched because the page carries none. */
import { Result } from "@resulted/results";
import type { DateComponents } from "@/bindings";
import * as geniusApi from "@/content/genius/utilities/geniusApi";
import { drain } from "@/content/genius/utilities/pool";

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

/** Their credits, with an absent `id` made `null`. */
const asRefs = (refs: readonly geniusApi.Ref[]): readonly NamedRef[] =>
    refs.map((ref) => ({ id: ref.id ?? null, name: ref.name }));

const asMetadata = (song: geniusApi.Song): SongMetadata => {
    const permissions = song.current_user_metadata?.permissions ?? [];

    return {
        featuredArtists: asRefs(song.featured_artists),
        // The album wide call ships the key with nothing in it, and an
        // empty list means unknown rather than denied.
        permissions: permissions.length === 0 ? null : permissions,
        primaryArtists: asRefs(song.primary_artists),
        primaryTag:
            song.primary_tag == null
                ? null
                : {
                      id: song.primary_tag.id ?? null,
                      name: song.primary_tag.name,
                  },
        producerArtists: asRefs(song.producer_artists),
        // Only an explicit `true` locks: absent means unknown, not locked.
        published: song.published === true,
        releaseDate: {
            day: song.release_date_components?.day ?? null,
            month: song.release_date_components?.month ?? null,
            year: song.release_date_components?.year ?? null,
        },
        songId: song.id,
        soundcloudUrl: song.soundcloud_url,
        tags: asRefs(song.tags),
        title: song.title,
        writerArtists: asRefs(song.writer_artists),
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
const asFailure = (error: geniusApi.ReadFailure): MetadataFailure =>
    error.kind === "network"
        ? { kind: "networkError" }
        : error.kind === "http"
          ? { kind: "refused", status: error.status }
          : { kind: "unreadable" };

export const loadSongMetadata = async (
    songId: number,
): Promise<Result<SongMetadata, MetadataFailure>> => {
    const song = await geniusApi.getSong(songId);

    return song.map(asMetadata).mapErr(asFailure);
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

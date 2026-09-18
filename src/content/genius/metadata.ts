/** The ten editable fields, fetched because the page carries none. */
import { Result } from "@resulted/results";
import type { DateComponents } from "@/bindings";
import type { AppError, AppResult } from "@/utilities/result";
import { apiGet } from "./api";
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

const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const namedRef = (value: unknown): NamedRef | null => {
    const entry = record(value);
    const name = entry?.name;
    const id = entry?.id;

    if (typeof name !== "string") {
        return null;
    }

    return { id: typeof id === "number" ? id : null, name };
};

const namedRefs = (value: unknown): readonly NamedRef[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry: unknown) => {
        const ref = namedRef(entry);
        return ref === null ? [] : [ref];
    });
};

const datePart = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

const dateComponents = (value: unknown): DateComponents => {
    const parts = record(value);

    if (parts === null) {
        return EMPTY_DATE;
    }

    return {
        year: datePart(parts.year),
        month: datePart(parts.month),
        day: datePart(parts.day),
    };
};

/**
 * `song.current_user_metadata.permissions`, the array Genius gates on.
 * @returns `null` when absent or empty, both of which mean unknown, not denied.
 */
const readPermissions = (value: unknown): readonly string[] | null => {
    const permissions = record(value)?.permissions;

    if (!Array.isArray(permissions)) {
        return null;
    }

    const names = permissions.filter(
        (entry: unknown): entry is string => typeof entry === "string",
    );

    // The album-wide call ships the key with nothing in it.
    return names.length === 0 ? null : names;
};

const readSong = (value: unknown): SongMetadata | null => {
    const song = record(value);
    const songId = song?.id;
    const title = song?.title;

    if (typeof songId !== "number" || typeof title !== "string") {
        return null;
    }

    const language = song?.language;
    const soundcloudUrl = song?.soundcloud_url;
    const youtubeUrl = song?.youtube_url;
    const published = song?.published;

    return {
        songId,
        title,
        primaryArtists: namedRefs(song?.primary_artists),
        featuredArtists: namedRefs(song?.featured_artists),
        writerArtists: namedRefs(song?.writer_artists),
        producerArtists: namedRefs(song?.producer_artists),
        releaseDate: dateComponents(song?.release_date_components),
        language: typeof language === "string" ? language : null,
        primaryTag: namedRef(song?.primary_tag),
        tags: namedRefs(song?.tags),
        soundcloudUrl:
            typeof soundcloudUrl === "string" && soundcloudUrl !== ""
                ? soundcloudUrl
                : null,
        youtubeUrl:
            typeof youtubeUrl === "string" && youtubeUrl !== ""
                ? youtubeUrl
                : null,
        permissions: readPermissions(song?.current_user_metadata),
        // Only an explicit `true` locks: absent means unknown, not locked.
        published: published === true,
    };
};

export const loadSongMetadata = async (
    songId: number,
): Promise<AppResult<SongMetadata>> => {
    const response = await apiGet(`/songs/${songId}`);

    if (response.isErr()) {
        return response;
    }

    const song = readSong(response.value.song);

    return song === null
        ? Result.err({
              kind: "decode",
              reason: `song ${songId} came back without the fields we need`,
          })
        : Result.ok(song);
};

/** Four at a time: enough to hide the latency, polite enough to ship. */
const CONCURRENCY = 4;

export type MetadataSink = (
    songId: number,
    result: AppResult<SongMetadata>,
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

/** The per-field summary a failed row shows, kept short enough to fit. */
export const describeLoadFailure = (error: AppError): string => {
    switch (error.kind) {
        case "http":
            return `Genius answered ${error.status}`;
        case "network":
            return "The request did not get through";
        case "decode":
            return "The answer was not the shape we expected";
        default:
            return "Could not load";
    }
};

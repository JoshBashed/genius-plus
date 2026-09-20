/** Genius's `bulk-song-update-status` payload: the only word on a task. */
import type { Result } from "@resulted/results";
import { z } from "zod";
import { type DecodeFailure, decode, decodeOr } from "@/utilities/decode";
import { DRAFT_FIELDS, FIELD_LABELS, FIELD_PAYLOAD_KEYS } from "./draft";

/** Their five task statuses, the last three of which end the task. */
export type BulkStatus =
    | "started"
    | "progress"
    | "completed"
    | "failed"
    | "canceled";

const statusSchema = z.enum([
    "started",
    "progress",
    "completed",
    "failed",
    "canceled",
]);

/** One song the task refused, and why. */
export interface SongFailure {
    readonly songId: number;
    /** Their `field_errors`, flattened, or the song's bare `errors`. */
    readonly reasons: readonly string[];
}

/** One status event, read with the keys `camelize: false` preserves. */
export interface BulkEvent {
    readonly status: BulkStatus;
    /** The task it belongs to, when the payload names one. */
    readonly taskId: string | null;
    /** 0 to 100, or `null` when the payload carried no counts. */
    readonly percent: number | null;
    /** The songs Genius genuinely stored, which is the only proof we get. */
    readonly updatedSongIds: readonly number[];
    readonly failures: readonly SongFailure[];
    readonly skippedSongIds: readonly number[];
    /** Their top level line, which only a failure carries. */
    readonly message: string | null;
}

/** Whether nothing further will arrive for this task. */
export const isTerminal = (status: BulkStatus): boolean =>
    status === "completed" || status === "failed" || status === "canceled";

/** Ids arrive as numbers, but a JSON id is a string often enough. */
const asNumber = (value: unknown): number | null => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== "string" || value.trim() === "") {
        return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
};

/** An id that will not read, which a row carrying one cannot be used. */
const idSchema = z.unknown().transform((value, ctx) => {
    const parsed = asNumber(value);

    if (parsed === null) {
        ctx.addIssue({ code: "custom", message: "not a number" });
        return z.NEVER;
    }

    return parsed;
});

/** A count Genius may not have sent, which is not worth refusing over. */
const countSchema = z.unknown().transform(asNumber);

/** Their task id, which is only ever shown and compared as a string. */
const taskIdSchema = z
    .unknown()
    .transform((value) =>
        typeof value === "number" || typeof value === "string"
            ? String(value)
            : null,
    );

/** An id we cannot read is one song unaccounted for, not a bad event. */
const idListSchema = z
    .array(z.unknown())
    .default([])
    .transform((rows) =>
        rows.flatMap((row) => {
            const id = decodeOr(idSchema, row);

            return id === null ? [] : [id];
        }),
    );

const messagesSchema = z
    .array(z.unknown())
    .default([])
    .transform((rows) =>
        rows.filter((row): row is string => typeof row === "string"),
    );

/** Their payload keys are the API's, so a column can name itself. */
const LABELS: ReadonlyMap<string, string> = new Map(
    DRAFT_FIELDS.map((field) => [
        FIELD_PAYLOAD_KEYS[field],
        FIELD_LABELS[field],
    ]),
);

/** One refused song, whose `field_errors` are keyed by payload key. */
const failedSongSchema = z.object({
    errors: messagesSchema,
    field_errors: z.record(z.string(), messagesSchema).default({}),
    id: idSchema,
});

const eventSchema = z.object({
    failed_songs: z.array(z.unknown()).default([]),
    message: z.string().nullish(),
    processed: countSchema,
    skipped_song_ids: idListSchema,
    status: statusSchema,
    task_id: taskIdSchema,
    total: countSchema,
    updated_song_ids: idListSchema,
});

/** `{tags: ["is invalid"]}` becomes `Tags: is invalid`, their own wording. */
const asFailure = (song: z.output<typeof failedSongSchema>): SongFailure => {
    const fields = Object.entries(song.field_errors).flatMap(([key, list]) =>
        list.map((reason) => `${LABELS.get(key) ?? key}: ${reason}`),
    );

    return {
        reasons: fields.length > 0 ? fields : song.errors,
        songId: song.id,
    };
};

/** Their own parser's arithmetic: `started` is 0, `progress` is the ratio. */
const percentOf = (event: z.output<typeof eventSchema>): number | null => {
    if (event.status === "started") {
        return 0;
    }

    const { processed, total } = event;

    if (event.status !== "progress" || processed === null || total === null) {
        return null;
    }

    return total <= 0 ? null : Math.round((processed / total) * 100);
};

/**
 * Reads one status event, refusing anything whose status it does not know.
 * @returns The event, or a `decode` error naming what arrived instead.
 */
export const parseBulkEvent = (
    payload: unknown,
): Result<BulkEvent, DecodeFailure> =>
    decode(eventSchema, payload, "a bulk update event").map((event) => ({
        // A song we cannot read is one we cannot name, not a bad event.
        failures: event.failed_songs.flatMap((row) => {
            const song = decodeOr(failedSongSchema, row);

            return song === null ? [] : [asFailure(song)];
        }),
        message:
            event.message == null || event.message === ""
                ? null
                : event.message,
        percent: percentOf(event),
        skippedSongIds: event.skipped_song_ids,
        status: event.status,
        taskId: event.task_id,
        updatedSongIds: event.updated_song_ids,
    }));

/** What a terminal event says about one song, and never more than that. */
export type SongVerdict =
    | { readonly kind: "saved" }
    | { readonly kind: "failed"; readonly reasons: readonly string[] }
    | { readonly kind: "canceled"; readonly skipped: boolean }
    | { readonly kind: "unknown" };

/**
 * Decides one song's fate from a terminal event.
 * `updated_song_ids` outranks everything: it is the only positive proof the
 * payload carries, and a completed task with no failures is their own.
 */
export const verdictFor = (event: BulkEvent, songId: number): SongVerdict => {
    if (event.updatedSongIds.includes(songId)) {
        return { kind: "saved" };
    }

    const failure = event.failures.find((entry) => entry.songId === songId);

    if (failure !== undefined) {
        return { kind: "failed", reasons: failure.reasons };
    }

    switch (event.status) {
        case "completed":
            return event.failures.length === 0
                ? { kind: "saved" }
                : { kind: "unknown" };
        case "failed":
            return {
                kind: "failed",
                reasons: event.message === null ? [] : [event.message],
            };
        case "canceled":
            return {
                kind: "canceled",
                skipped: event.skippedSongIds.includes(songId),
            };
        default:
            return { kind: "unknown" };
    }
};

/**
 * The row's line for a verdict.
 * @param queued What the row settled on when the task was accepted, which an
 * unknown verdict has to keep: it is still all anybody knows.
 */
export const describeVerdict = (
    verdict: SongVerdict,
    queued: string,
): string => {
    switch (verdict.kind) {
        case "saved":
            return "Saved";
        case "failed":
            return verdict.reasons.length === 0
                ? "Genius rejected it without saying why"
                : `Genius rejected it: ${verdict.reasons.join("; ")}`;
        case "canceled":
            return verdict.skipped
                ? "Genius canceled the task and skipped this song, " +
                      "so nothing was saved"
                : "Genius canceled the task, so this song was not saved";
        case "unknown":
            return `${queued}, and the task ended without naming this song`;
    }
};

/** How a row reads while its task is in flight. */
export const pendingLine = (queued: string, watched: boolean): string =>
    watched
        ? `${queued}, waiting for Genius`
        : `${queued}, and nothing here can confirm it landed`;

/** How it reads when Genius never says anything at all. */
export const timedOutLine = (queued: string, seconds: number): string =>
    `${queued}, still unconfirmed after ${seconds} seconds`;

/** The optional middle of a task's life, which is over in a moment. */
export const progressLine = (queued: string, percent: number | null): string =>
    percent === null
        ? `${queued}, Genius is applying it`
        : `${queued}, Genius is ${percent}% through`;

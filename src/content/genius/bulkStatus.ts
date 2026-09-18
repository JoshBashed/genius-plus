/** Genius's `bulk-song-update-status` payload: the only word on a task. */
import { Result } from "@resulted/results";
import type { AppResult } from "@/utilities/result";
import { DRAFT_FIELDS, FIELD_LABELS, FIELD_PAYLOAD_KEYS } from "./draft";

/** Their five task statuses, the last three of which end the task. */
export type BulkStatus =
    | "started"
    | "progress"
    | "completed"
    | "failed"
    | "canceled";

const STATUSES: readonly string[] = [
    "started",
    "progress",
    "completed",
    "failed",
    "canceled",
];

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

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
    typeof value === "object" && value !== null
        ? (value as Readonly<Record<string, unknown>>)
        : null;

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

const idList = (value: unknown): readonly number[] =>
    Array.isArray(value)
        ? value.flatMap((entry: unknown) => {
              const id = asNumber(entry);

              return id === null ? [] : [id];
          })
        : [];

const isString = (value: unknown): value is string => typeof value === "string";

const messages = (value: unknown): readonly string[] =>
    Array.isArray(value) ? value.filter(isString) : [];

/** Their payload keys are the API's, so a column can name itself. */
const LABELS: ReadonlyMap<string, string> = new Map(
    DRAFT_FIELDS.map((field) => [
        FIELD_PAYLOAD_KEYS[field],
        FIELD_LABELS[field],
    ]),
);

/** `{tags: ["is invalid"]}` becomes `Tags: is invalid`, their own wording. */
const fieldReasons = (value: unknown): readonly string[] => {
    const errors = record(value);

    if (errors === null) {
        return [];
    }

    return Object.entries(errors).flatMap(([key, list]) =>
        messages(list).map((reason) => `${LABELS.get(key) ?? key}: ${reason}`),
    );
};

const failuresOf = (value: unknown): readonly SongFailure[] =>
    Array.isArray(value)
        ? value.flatMap((entry: unknown) => {
              const song = record(entry);
              const id = asNumber(song?.id);

              if (song === null || id === null) {
                  return [];
              }

              const fields = fieldReasons(song.field_errors);
              const reasons =
                  fields.length > 0 ? fields : messages(song.errors);

              return [{ reasons, songId: id }];
          })
        : [];

/** Their own parser's arithmetic: `started` is 0, `progress` is the ratio. */
const percentOf = (
    status: BulkStatus,
    body: Readonly<Record<string, unknown>>,
): number | null => {
    if (status === "started") {
        return 0;
    }

    if (status !== "progress") {
        return null;
    }

    const processed = asNumber(body.processed);
    const total = asNumber(body.total);

    if (processed === null || total === null || total <= 0) {
        return null;
    }

    return Math.round((processed / total) * 100);
};

/**
 * Reads one status event, refusing anything whose status it does not know.
 * @returns The event, or a `decode` error naming what arrived instead.
 */
export const parseBulkEvent = (payload: unknown): AppResult<BulkEvent> => {
    const body = record(payload);
    const status = body?.status;

    if (body === null || typeof status !== "string") {
        return Result.err({
            kind: "decode",
            reason: "a bulk update event carried no status",
        });
    }

    if (!STATUSES.includes(status)) {
        return Result.err({
            kind: "decode",
            reason: `a bulk update event reported "${status}"`,
        });
    }

    const known = status as BulkStatus;
    const taskId = body.task_id;
    const message = body.message;

    return Result.ok({
        failures: failuresOf(body.failed_songs),
        message: typeof message === "string" && message !== "" ? message : null,
        percent: percentOf(known, body),
        skippedSongIds: idList(body.skipped_song_ids),
        status: known,
        taskId:
            typeof taskId === "number" || typeof taskId === "string"
                ? String(taskId)
                : null,
        updatedSongIds: idList(body.updated_song_ids),
    });
};

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

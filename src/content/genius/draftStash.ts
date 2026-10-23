/** Staged edits live in memory, so a stray navigation loses them all. */
import { Result } from "@resulted/results";
import { z } from "zod";
import {
    DRAFT_FIELDS,
    type DraftField,
    type SongDraft,
} from "@/content/genius/draft";
import { decodeOr } from "@/utilities/decode";

/** The browser would not keep the stash, which is never worth stopping for. */
export interface StashError {
    readonly kind: "unsupported";
    readonly reason: string;
}

const KEY = "genius-plus:drafts:";

/** Bumped whenever a stash changes shape, to drop unreadable ones. */
const VERSION = 4;

/** Older stashes are the user having long since moved on. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One row's staged edit, as a patch rather than a whole draft.
 * Storing the baseline too is what lets a restore tell an edit of the user's
 * own from a field Genius changed while the stash sat here.
 */
export interface StashedRow {
    /** The values Genius had when the patch was staged. */
    readonly baseline: SongDraft;
    /** Only the fields the user changed; nothing untouched is ever stored. */
    readonly patch: Partial<SongDraft>;
}

export interface Stash {
    readonly version: number;
    readonly savedAt: number;
    readonly rows: Readonly<Record<number, StashedRow>>;
}

const keyFor = (albumId: number): string => `${KEY}${albumId}`;

const failed = (reason: string): Result<void, StashError> =>
    Result.err({ kind: "unsupported", reason });

/** A chip as react-select holds it, label in any of its three shapes. */
const optionSchema = z.object({
    __isNew__: z.boolean().optional(),
    label: z.union([
        z.string(),
        z.number(),
        z.object({
            primary: z.string(),
            secondary: z.string().optional(),
            secondaryPrefix: z.string().optional(),
        }),
    ]),
    value: z.union([z.string(), z.number()]),
});

const draftSchema = z.object({
    featuredArtists: z.array(optionSchema),
    language: z.string().nullable(),
    primaryArtists: z.array(optionSchema),
    primaryTagId: z.number().nullable(),
    producerArtists: z.array(optionSchema),
    releaseDate: z.object({
        day: z.number().nullable(),
        month: z.number().nullable(),
        year: z.number().nullable(),
    }),
    soundcloudUrl: z.string().nullable(),
    tags: z.array(optionSchema),
    title: z.string(),
    writerArtists: z.array(optionSchema),
    youtubeUrl: z.string().nullable(),
});

const rowSchema = z.object({
    baseline: draftSchema,
    patch: draftSchema.partial(),
});

/** A version bump covers our own writes; the schema covers anything else. */
const stashSchema = z.object({
    rows: z.record(z.string(), z.unknown()),
    savedAt: z.number(),
    version: z.literal(VERSION),
});

/** A row that will not parse is one edit lost, not the whole stash. */
const usableRows = (
    rows: Readonly<Record<string, unknown>>,
): Readonly<Record<number, StashedRow>> => {
    const kept: Record<number, StashedRow> = {};

    for (const [songId, raw] of Object.entries(rows)) {
        const row = decodeOr(rowSchema, raw);

        if (row !== null) {
            kept[Number(songId)] = row;
        }
    }

    return kept;
};

/** Parses a stored string, which may be anything another script wrote. */
const parseStored = (raw: string): unknown => {
    const parsed = Result.trySync((): unknown => JSON.parse(raw));
    return parsed.isOk() ? parsed.value : null;
};

/**
 * Reads the stash for one album.
 * @returns `null` when absent, unreadable, stale, or of another version.
 */
export const readStash = (albumId: number): Stash | null => {
    const raw = Result.trySync(() => localStorage.getItem(keyFor(albumId)));

    if (raw.isErr() || raw.value === null) {
        return null;
    }

    const stash = decodeOr(stashSchema, parseStored(raw.value));

    return stash !== null && Date.now() - stash.savedAt < MAX_AGE_MS
        ? { ...stash, rows: usableRows(stash.rows) }
        : null;
};

/**
 * Replaces the stash for one album, dropping it when nothing is staged.
 * @param rows Keyed by song id; only rows the user actually edited.
 */
export const writeStash = (
    albumId: number,
    rows: Readonly<Record<number, StashedRow>>,
): Result<void, StashError> => {
    if (Object.keys(rows).length === 0) {
        return clearStash(albumId);
    }

    const stash: Stash = { rows, savedAt: Date.now(), version: VERSION };
    const wrote = Result.trySync(() => {
        localStorage.setItem(keyFor(albumId), JSON.stringify(stash));
    });

    // Private mode and a full quota both throw, and neither is worth
    // interrupting an edit over.
    return wrote.isErr()
        ? failed("this browser would not store the draft")
        : Result.ok(undefined);
};

export const clearStash = (albumId: number): Result<void, StashError> => {
    const removed = Result.trySync(() => {
        localStorage.removeItem(keyFor(albumId));
    });

    return removed.isErr()
        ? failed("this browser would not clear the draft")
        : Result.ok(undefined);
};

/** Where a queued task waits for whoever can hear its channel. */
const TASK_KEY = "genius-plus:tasks:";

const taskKeyFor = (albumId: number): string => `${TASK_KEY}${albumId}`;

/**
 * A bulk task queued by one page for another page to hear out.
 *
 * A bulk write is accepted, not applied, and its verdict arrives over
 * Pusher. The import has navigated away by then, so it leaves the task
 * here and the album's own table subscribes in its place.
 */
export interface StashedTask {
    readonly taskId: string;
    /** Only a task with a channel is worth keeping; nothing else answers. */
    readonly channel: string;
    readonly songIds: readonly number[];
    readonly fields: readonly DraftField[];
    /** The line the row settled on when Genius accepted the task. */
    readonly queued: string;
}

interface TaskStash {
    readonly version: number;
    readonly savedAt: number;
    readonly tasks: readonly StashedTask[];
}

const taskSchema = z.object({
    channel: z.string(),
    fields: z.array(z.enum(DRAFT_FIELDS)),
    queued: z.string(),
    songIds: z.array(z.number()),
    taskId: z.string(),
});

const taskStashSchema = z.object({
    savedAt: z.number(),
    tasks: z.array(z.unknown()),
    version: z.literal(VERSION),
});

/** Leaves queued tasks for the page that can subscribe to them. */
export const writeTasks = (
    albumId: number,
    tasks: readonly StashedTask[],
): Result<void, StashError> => {
    if (tasks.length === 0) {
        return Result.ok(undefined);
    }

    const stash: TaskStash = {
        savedAt: Date.now(),
        tasks,
        version: VERSION,
    };
    const wrote = Result.trySync(() => {
        localStorage.setItem(taskKeyFor(albumId), JSON.stringify(stash));
    });

    return wrote.isErr()
        ? failed("this browser would not store the queued task")
        : Result.ok(undefined);
};

/**
 * Reads the queued tasks for one album and clears them.
 * Taken rather than read: a task is worth subscribing to once, and a
 * copy left behind would be watched again on every later visit.
 */
export const takeTasks = (albumId: number): readonly StashedTask[] => {
    const raw = Result.trySync(() => localStorage.getItem(taskKeyFor(albumId)));

    if (raw.isErr() || raw.value === null) {
        return [];
    }

    Result.trySync(() => {
        localStorage.removeItem(taskKeyFor(albumId));
    });

    const stash = decodeOr(taskStashSchema, parseStored(raw.value));

    if (stash === null || Date.now() - stash.savedAt >= MAX_AGE_MS) {
        return [];
    }

    return stash.tasks.flatMap((row): readonly StashedTask[] => {
        const task = decodeOr(taskSchema, row);
        return task === null ? [] : [task];
    });
};

/**
 * Warns before a hard navigation discards staged edits.
 * @param hasEdits Consulted at navigation time, not registration time.
 * @returns A function that removes the warning.
 */
export const guardUnload = (hasEdits: () => boolean): (() => void) => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
        if (!hasEdits()) {
            return;
        }

        event.preventDefault();
    };

    addEventListener("beforeunload", onBeforeUnload);

    return () => removeEventListener("beforeunload", onBeforeUnload);
};

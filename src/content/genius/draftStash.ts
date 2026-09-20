/** Staged edits live in memory, so a stray navigation loses them all. */
import { Result } from "@resulted/results";
import type { DraftField, SongDraft } from "./draft";

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

const isObject = (value: unknown): boolean =>
    typeof value === "object" && value !== null;

/** A version bump covers our own writes; this covers anything else. */
const usableRow = (value: unknown): boolean => {
    if (!isObject(value)) {
        return false;
    }

    const row = value as Partial<StashedRow>;

    return isObject(row.baseline) && isObject(row.patch);
};

const usableRows = (
    rows: Readonly<Record<number, StashedRow>>,
): Readonly<Record<number, StashedRow>> => {
    const kept: Record<number, StashedRow> = {};

    for (const [songId, row] of Object.entries(rows)) {
        if (usableRow(row)) {
            kept[Number(songId)] = row;
        }
    }

    return kept;
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

    const parsed = Result.trySync(() => JSON.parse(raw.value ?? "") as Stash);

    if (parsed.isErr()) {
        return null;
    }

    const stash = parsed.value;
    const usable =
        stash?.version === VERSION &&
        typeof stash.savedAt === "number" &&
        Date.now() - stash.savedAt < MAX_AGE_MS &&
        isObject(stash.rows);

    return usable ? { ...stash, rows: usableRows(stash.rows) } : null;
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

const usableTask = (value: unknown): boolean => {
    if (!isObject(value)) {
        return false;
    }

    const task = value as Partial<StashedTask>;

    return (
        typeof task.taskId === "string" &&
        typeof task.channel === "string" &&
        Array.isArray(task.songIds)
    );
};

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

    const parsed = Result.trySync(
        () => JSON.parse(raw.value ?? "") as TaskStash,
    );

    if (parsed.isErr()) {
        return [];
    }

    const stash = parsed.value;
    const usable =
        stash?.version === VERSION &&
        typeof stash.savedAt === "number" &&
        Date.now() - stash.savedAt < MAX_AGE_MS &&
        Array.isArray(stash.tasks);

    return usable ? stash.tasks.filter(usableTask) : [];
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

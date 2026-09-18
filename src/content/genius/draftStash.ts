/** Staged edits live in memory, so a stray navigation loses them all. */
import { Result } from "@resulted/results";
import type { AppResult } from "@/utilities/result";
import type { SongDraft } from "./draft";

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

const failed = (reason: string): AppResult<void> =>
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
): AppResult<void> => {
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

export const clearStash = (albumId: number): AppResult<void> => {
    const removed = Result.trySync(() => {
        localStorage.removeItem(keyFor(albumId));
    });

    return removed.isErr()
        ? failed("this browser would not clear the draft")
        : Result.ok(undefined);
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

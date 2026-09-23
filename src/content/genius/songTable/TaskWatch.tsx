/** One queued bulk task's Pusher subscription. It renders nothing. */
import type { PageElement } from "@/bindings";
import { log } from "@/utilities/log";
import { type BulkEvent, parseBulkEvent } from "../bulkStatus";
import type { SongDraft } from "../draft";
import { usePusher } from "../geniusHooks";
import { useCallback, useEffect } from "../react";
import type { BulkTask, FieldConflict } from "../write";

/** Their event name for every bulk update task's status. */
const EVENT_NAME = "bulk-song-update-status";

/** Long enough for a busy queue, short enough to stop implying an outcome. */
export const TASK_TIMEOUT_MS = 90_000;

/** One song inside a queued task, as the row that sent it stood. */
export interface PendingSong {
    readonly songId: number;
    /** What was sent, which only a confirmation folds into the baseline. */
    readonly draft: SongDraft;
    /** The row's edit count when it was sent; a later edit hides the note. */
    readonly edited: number;
    /** The line the row settled on when Genius accepted the task. */
    readonly queued: string;
    /** Whether the row's other endpoint failed, which no verdict undoes. */
    readonly failed: boolean;
    readonly conflicts: readonly FieldConflict[];
}

/** A task the table is still listening for. */
export interface PendingTask {
    readonly task: BulkTask;
    /** Narrowed once, so the watcher always has a channel to subscribe to. */
    readonly channel: string;
    readonly songs: readonly PendingSong[];
}

export interface TaskWatchProps {
    readonly pending: PendingTask;
    /** Genius's own hook, which builds and shares the connection itself. */
    readonly onEvent: (pending: PendingTask, event: BulkEvent) => void;
    readonly onTimeout: (pending: PendingTask) => void;
}

/**
 * Binds one channel for as long as the task is in flight.
 * Unmounting is the unsubscribe, so the table drops a terminal task and this
 * goes with it; the timeout is what stops an unanswered one waiting forever.
 */
export const TaskWatch = ({
    onEvent,
    onTimeout,
    pending,
}: TaskWatchProps): PageElement => {
    const callback = useCallback(
        (payload: unknown): void => {
            const event = parseBulkEvent(payload);

            if (event.isErr()) {
                log.warn("bulk status", event.error.reason);
                return;
            }

            onEvent(pending, event.value);
        },
        [onEvent, pending],
    );

    usePusher({
        callback,
        camelize: false,
        channelName: pending.channel,
        eventName: EVENT_NAME,
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            onTimeout(pending);
        }, TASK_TIMEOUT_MS);

        return () => {
            clearTimeout(timer);
        };
    }, [onTimeout, pending]);

    return <span hidden />;
};

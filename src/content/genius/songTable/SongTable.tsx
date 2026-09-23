/** The album table: its entry point, its modals, and its staged edits. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    asPageValue,
    describeBindingError,
    getModal,
    getReactDom,
    type ModalProps,
    type PageComponent,
    type PageElement,
    type PageReactDom,
    type SelectOption,
} from "@/bindings";
import { log } from "@/utilities/log";
import {
    type BulkEvent,
    describeVerdict,
    isTerminal,
    pendingLine,
    progressLine,
    type SongVerdict,
    timedOutLine,
    verdictFor,
} from "../bulkStatus";
import {
    type DraftField,
    EMPTY_DRAFT,
    FIELD_LABELS,
    fieldPatch,
    isEmptyField,
    patchFields,
    type SongDraft,
} from "../draft";
import {
    clearStash,
    guardUnload,
    readStash,
    type StashedRow,
    type StashedTask,
    takeTasks,
    writeStash,
} from "../draftStash";
import { Button, theme } from "../geniusComponents";
import { hasUsePusher, useLanguageOptions } from "../geniusHooks";
import { dropEditorHash, EDITOR_HASH, importUrlFor } from "../importRoute";
import {
    describeMetadataFailure,
    loadAlbumMetadata,
    loadSongMetadata,
    type SongMetadata,
} from "../metadata";
import { optionFor, optionLabel } from "../options";
import type { AlbumSeed } from "../pageState";
import { canEdit } from "../permissions";
import { SAVE_ADAPTERS, type SongEdit } from "../saveAdapter";
import { observeToolbarSlot, type ToolbarSlot } from "../toolbarSlot";
import {
    describeSaveFailure,
    type FieldConflict,
    planSave,
    restoreConflicts,
    runSave,
    type SaveOutcome,
    type SavePlan,
    type SaveStage,
} from "../write";
import { withCurrent } from "./ColumnEditor";
import { ColumnMenu, type FillMode } from "./ColumnMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { COLUMNS, type ColumnSpec } from "./columns";
import { FillDialog } from "./FillDialog";
import {
    droppedRow,
    openedRow,
    patchedRow,
    type RowState,
    reloadedRow,
    revertedRow,
    savedRow,
    stashedRowOf,
} from "./rowState";
import { type RowLoad, type RowSave, SongRow } from "./SongRow";
import { Launch, Root } from "./styles";
import {
    type PendingSong,
    type PendingTask,
    TASK_TIMEOUT_MS,
    TaskWatch,
} from "./TaskWatch";

export interface SongTableProps {
    readonly album: AlbumSeed;
    /** From `GET /tags/home`; may be empty if the call failed. */
    readonly primaryTagOptions: readonly SelectOption[];
}

/** Long enough to coalesce a burst of typing, short enough to survive it. */
const STASH_DELAY_MS = 500;

/** One object, so a row that has not loaded keeps the same prop. */
const LOADING: RowLoad = { status: "loading" };

const plural = (count: number): string => (count === 1 ? "song" : "songs");

/** The line under the toolbar once a run finishes. */
const describeOutcome = (outcome: SaveOutcome): string => {
    const parts: string[] = [];

    if (outcome.saved > 0) {
        parts.push(`saved ${outcome.saved} ${plural(outcome.saved)}`);
    }

    if (outcome.queued > 0) {
        parts.push(`queued ${outcome.queued} ${plural(outcome.queued)}`);
    }

    if (outcome.failed > 0) {
        parts.push(`${outcome.failed} failed`);
    }

    if (outcome.conflicted > 0) {
        parts.push(
            `held fields back on ${outcome.conflicted} ${plural(
                outcome.conflicted,
            )} that changed on Genius`,
        );
    }

    if (parts.length === 0) {
        return "Nothing was sent";
    }

    // A queued row is the other reason to look: only it says how it ended.
    const detail =
        outcome.failed > 0 || outcome.conflicted > 0 || outcome.queued > 0
            ? "; see the Row column"
            : "";

    return `Genius ${parts.join(", ")}${detail}`;
};

/** What a verdict makes of the row, with uncertainty left as queued. */
const VERDICT_STAGES: Readonly<Record<SongVerdict["kind"], SaveStage>> = {
    canceled: "canceled",
    failed: "failed",
    saved: "saved",
    unknown: "queued",
};

/** The clause a queued note already carries, kept by its successor. */
const exceptClause = (conflicts: readonly FieldConflict[]): string =>
    conflicts.length === 0
        ? ""
        : `, except ${conflicts
              .map((entry) => FIELD_LABELS[entry.field])
              .join(", ")}`;

/** The same verdict, added to a row the other endpoint already failed. */
const verdictClause = (verdict: SongVerdict): string => {
    switch (verdict.kind) {
        case "saved":
            return ", and the queued fields did land";
        case "failed":
            return verdict.reasons.length === 0
                ? ", and Genius rejected the queued fields too"
                : `, and Genius rejected the queued fields: ${verdict.reasons.join(
                      "; ",
                  )}`;
        case "canceled":
            return ", and Genius canceled the task, so they did not land";
        case "unknown":
            return ", and the task ended without naming this song";
    }
};

/** A row that failed for its other endpoint stays failed, whatever lands. */
const holdingStage = (song: PendingSong): SaveStage =>
    song.failed ? "failed" : "queued";

/** One song's line once its task ended; it claims no more than it knows. */
const verdictNote = (verdict: SongVerdict, song: PendingSong): RowSave => {
    if (song.failed) {
        return {
            conflicts: song.conflicts,
            edited: song.edited,
            message: `${song.queued}${verdictClause(verdict)}`,
            stage: "failed",
        };
    }

    const line = describeVerdict(verdict, song.queued);

    return {
        conflicts: song.conflicts,
        edited: song.edited,
        message:
            verdict.kind === "saved"
                ? `${line}${exceptClause(song.conflicts)}`
                : line,
        stage: VERDICT_STAGES[verdict.kind],
    };
};

const initialLoads = (album: AlbumSeed): Readonly<Record<number, RowLoad>> => {
    const entries: [number, RowLoad][] = album.tracks.map((track) => [
        track.songId,
        LOADING,
    ]);

    return Object.fromEntries(entries);
};

const renderSongTable = (props: SongTableProps): PageElement => {
    const { album, primaryTagOptions } = props;
    const albumId = album.albumId;

    const [loads, setLoads] = useState<Readonly<Record<number, RowLoad>>>(() =>
        initialLoads(album),
    );
    /** The album's songs; creating one is the import page's job, not ours. */
    const tracks = album.tracks;
    /**
     * Every row's staged edit, held here rather than in the row. The table
     * outlives the modal, so closing it can no longer unmount an edit.
     */
    const [rows, setRows] = useState<Readonly<Record<number, RowState>>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    /** Latches on first open; the album is never fetched before. */
    const [opened, setOpened] = useState(false);
    const [Modal, setModal] = useState<PageComponent<ModalProps> | null>(null);
    const [slot, setSlot] = useState<ToolbarSlot | null>(null);
    const [saves, setSaves] = useState<Readonly<Record<number, RowSave>>>({});
    /** Non-null only while the confirmation modal is open. */
    const [plan, setPlan] = useState<SavePlan | null>(null);
    const [saving, setSaving] = useState(false);
    /** Every queued bulk task still to be heard from, one channel each. */
    const [pending, setPending] = useState<readonly PendingTask[]>([]);
    const [reactDom, setReactDom] = useState<PageReactDom | null>(null);

    /** Read once, at mount: what a lost page left behind for this album. */
    const [stashed] = useState<Readonly<Record<number, StashedRow>>>(
        () => readStash(albumId)?.rows ?? {},
    );
    const [notice, setNotice] = useState(() => Object.keys(stashed).length > 0);
    /**
     * Taken once, at mount: bulk tasks another page queued and could not
     * stay to hear. The import is the one that leaves them, because it
     * navigates here the moment Genius accepts the write.
     */
    const [adopted] = useState<readonly StashedTask[]>(() =>
        takeTasks(albumId),
    );

    // Their verdict arrives over Pusher, so without this nobody is
    // listening and a rejected import row looks saved forever.
    useEffect(() => {
        if (adopted.length === 0 || !hasUsePusher()) {
            return;
        }

        setPending((previous) => [
            ...previous,
            ...adopted.flatMap((one): readonly PendingTask[] => {
                const songs = one.songIds.flatMap(
                    (songId): readonly PendingSong[] => {
                        const row = stashed[songId];

                        return row === undefined
                            ? []
                            : [
                                  {
                                      conflicts: [],
                                      draft: { ...row.baseline, ...row.patch },
                                      edited: 0,
                                      failed: false,
                                      queued: one.queued,
                                      songId,
                                  },
                              ];
                    },
                );

                return songs.length === 0
                    ? []
                    : [
                          {
                              channel: one.channel,
                              songs,
                              task: {
                                  channel: one.channel,
                                  fields: one.fields,
                                  songIds: one.songIds,
                                  taskId: one.taskId,
                              },
                          },
                      ];
            }),
        ]);
    }, [adopted, stashed]);

    /** The rows as of the last commit, for the debounce and the unload guard. */
    const rowsRef = useRef<Readonly<Record<number, RowState>>>({});
    const dirtyRef = useRef(0);
    /** Set once the user throws a restore away, so it is never carried on. */
    const dropped = useRef(false);
    /** Cleared after the first commit, which stages nothing of its own. */
    const armed = useRef(false);
    const stashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Non-null only while the column fill dialog is open. */
    const [fillTarget, setFillTarget] = useState<{
        readonly column: ColumnSpec;
        readonly mode: FillMode;
    } | null>(null);
    /** A scratch draft the fill dialog's editor writes one field of. */
    const [fillDraft, setFillDraft] = useState<SongDraft>(EMPTY_DRAFT);

    const persist = useCallback((): void => {
        const next: Record<number, StashedRow> = {};
        let known = 0;

        // A song whose row has not loaded cannot have taken its stashed
        // patch yet, so writing without it would delete what we came for.
        for (const [songId, row] of Object.entries(stashed)) {
            if (
                !dropped.current &&
                rowsRef.current[Number(songId)] === undefined
            ) {
                next[Number(songId)] = row;
            }
        }

        for (const [songId, row] of Object.entries(rowsRef.current)) {
            const staged = stashedRowOf(row);
            known += 1;

            if (staged !== null) {
                next[Number(songId)] = staged;
            }
        }

        // An empty set is also how a table whose rows never loaded looks,
        // and erasing the stash is the one thing it must never do.
        if (known === 0 && Object.keys(next).length === 0) {
            return;
        }

        const wrote = writeStash(albumId, next);

        if (wrote.isErr()) {
            log.warn("draft stash", wrote.error.reason);
        }
    }, [albumId, stashed]);

    const cancelStash = useCallback((): void => {
        if (stashTimer.current !== null) {
            clearTimeout(stashTimer.current);
            stashTimer.current = null;
        }
    }, []);

    const scheduleStash = useCallback((): void => {
        cancelStash();
        stashTimer.current = setTimeout(() => {
            stashTimer.current = null;
            persist();
        }, STASH_DELAY_MS);
    }, [cancelStash, persist]);

    // The rows a debounced write will read, published before it is armed.
    useEffect(() => {
        rowsRef.current = rows;

        // Merely visiting the page must not refresh the stash's own clock.
        if (armed.current) {
            scheduleStash();
        }

        armed.current = true;
    }, [rows, scheduleStash]);

    // A client side navigation unmounts this tree without any warning,
    // so a pending debounce has to land before the table goes.
    useEffect(
        () => () => {
            if (stashTimer.current !== null) {
                clearTimeout(stashTimer.current);
                stashTimer.current = null;
                persist();
            }
        },
        [persist],
    );

    // Only covers a reload or a tab close; the stash covers the rest.
    useEffect(() => guardUnload(() => dirtyRef.current > 0), []);

    // Not while it is opening: replacing the URL under their modal
    // reads as a navigation and it closes itself. The hash is dropped
    // on close instead, so a tree that remounts opens again rather
    // than stranding the edits, and a reload after that is ordinary.
    // The import sends the browser here with its edits already stashed,
    // so the table opens itself rather than waiting to be asked.
    useEffect(() => {
        if (location.hash !== EDITOR_HASH) {
            return;
        }

        setOpen(true);
        setOpened(true);
    }, []);

    useEffect(() => observeToolbarSlot(setSlot), []);

    useEffect(() => {
        let live = true;

        void getReactDom().then((found) => {
            if (live && found.isOk()) {
                setReactDom(() => found.value);
            }
        });

        return () => {
            live = false;
        };
    }, []);

    useEffect(() => {
        let live = true;

        void getModal().then((found) => {
            if (!live) {
                return;
            }

            if (found.isOk()) {
                setModal(() => found.value);
                return;
            }

            const line = describeBindingError(found.error);

            log.error("modal unavailable", line);
            setMessage(line);
        });

        return () => {
            live = false;
        };
    }, []);

    const freshLanguageOptions = useLanguageOptions();
    // The hook rebuilds its array each render, which a memoised row would
    // read as a new prop every time.
    const [languageOptions, setLanguageOptions] =
        useState(freshLanguageOptions);

    if (languageOptions.length !== freshLanguageOptions.length) {
        setLanguageOptions(freshLanguageOptions);
    }

    const record = useCallback((songId: number, result: RowLoad): void => {
        setLoads((previous) => ({ ...previous, [songId]: result }));
    }, []);

    // biome-ignore lint/correctness/useExhaustiveDependencies: `album` never changes while this tree is mounted.
    useEffect(() => {
        if (!opened) {
            return;
        }

        let live = true;

        void loadAlbumMetadata(
            album.tracks.map((track) => track.songId),
            (songId, result) => {
                if (!live) {
                    return;
                }

                record(
                    songId,
                    result.isOk()
                        ? { metadata: result.value, status: "ready" }
                        : {
                              message: describeMetadataFailure(result.error),
                              status: "error",
                          },
                );
            },
        );

        return () => {
            live = false;
        };
    }, [opened, record]);

    const onRetry = useCallback(
        (songId: number): void => {
            record(songId, LOADING);

            void loadSongMetadata(songId).then((result) => {
                record(
                    songId,
                    result.isOk()
                        ? { metadata: result.value, status: "ready" }
                        : {
                              message: describeMetadataFailure(result.error),
                              status: "error",
                          },
                );
            });
        },
        [record],
    );

    /** Resolves one draft's primary tag id against this song's own options. */
    const tagNameIn =
        (metadata: SongMetadata) =>
        (draft: SongDraft): string | null => {
            const option = optionFor(
                withCurrent(
                    primaryTagOptions,
                    metadata.primaryTag?.id ?? null,
                    metadata.primaryTag?.name ?? null,
                ),
                draft.primaryTagId,
            );

            return option === null ? null : optionLabel(option.label);
        };

    /**
     * A restored patch sits over the fresh baseline, so only the fields the
     * user touched can disagree with what Genius has since stored.
     */
    const restoreMark = (row: RowState): RowSave | null => {
        if (row.restored === null) {
            return null;
        }

        const conflicts = restoreConflicts(
            row.restored,
            row.baseline,
            row.draft,
            patchFields(row.patch),
            tagNameIn(row.source),
        );

        return conflicts.length === 0
            ? null
            : {
                  conflicts,
                  edited: row.edited,
                  message: "Genius changed these after your edit was stashed",
                  stage: "conflict",
              };
    };

    // Derived during render, so a row never paints against a stale baseline.
    const stale = tracks.filter((track) => {
        const load = loads[track.songId];

        return (
            load?.status === "ready" &&
            rows[track.songId]?.source !== load.metadata
        );
    });

    if (stale.length > 0) {
        const nextRows: Record<number, RowState> = { ...rows };
        const nextSaves: Record<number, RowSave> = { ...saves };

        for (const track of stale) {
            const load = loads[track.songId];

            if (load?.status !== "ready") {
                continue;
            }

            const current = rows[track.songId];
            // A reload keeps the patch and re-reads the baseline under it,
            // which is the only way it cannot lose the edit it was showing.
            const row =
                current === undefined
                    ? openedRow(
                          load.metadata,
                          dropped.current
                              ? null
                              : (stashed[track.songId] ?? null),
                      )
                    : reloadedRow(current, load.metadata);
            const mark = restoreMark(row);

            nextRows[track.songId] = row;

            if (mark === null) {
                delete nextSaves[track.songId];
            } else {
                nextSaves[track.songId] = mark;
            }
        }

        setRows(nextRows);
        setSaves(nextSaves);
    }

    const editedRows = (): readonly SongEdit[] =>
        tracks.flatMap((track) => {
            const row = rows[track.songId];

            if (row === undefined || row.changed.length === 0) {
                return [];
            }

            return [
                {
                    baseline: row.baseline,
                    draft: row.draft,
                    metadata: row.source,
                    originalTitle: row.source.title,
                    primaryTagName: tagNameIn(row.source)(row.draft),
                    songId: track.songId,
                    trackNumber: track.trackNumber,
                    url: track.url,
                },
            ];
        });

    const dirtyCount = tracks.filter(
        (track) => (rows[track.songId]?.changed.length ?? 0) > 0,
    ).length;
    // A task nobody has heard back from is still a write in flight, and
    // sending the same row again while it runs is how a lost update starts.
    const busy = saving || pending.length > 0;

    // Read at navigation time by the unload guard, which has no render.
    useEffect(() => {
        dirtyRef.current = dirtyCount;
    }, [dirtyCount]);

    const onPatch = useCallback(
        (songId: number, next: Partial<SongDraft>): void => {
            setRows((previous) => {
                const row = previous[songId];

                return row === undefined
                    ? previous
                    : { ...previous, [songId]: patchedRow(row, next) };
            });
        },
        [],
    );

    const onRevert = useCallback((songId: number): void => {
        setRows((previous) => {
            const row = previous[songId];

            return row === undefined
                ? previous
                : { ...previous, [songId]: revertedRow(row) };
        });
    }, []);

    const mark = useCallback((songId: number, next: RowSave): void => {
        setSaves((previous) => ({ ...previous, [songId]: next }));
    }, []);

    /** Folds stored fields into the baseline, so the row reads clean. */
    const adopt = useCallback(
        (
            songId: number,
            draft: SongDraft,
            fields: readonly DraftField[],
        ): void => {
            if (fields.length === 0) {
                return;
            }

            setRows((previous) => {
                const row = previous[songId];

                return row === undefined
                    ? previous
                    : { ...previous, [songId]: savedRow(row, draft, fields) };
            });
        },
        [],
    );

    /** Drops a task once it can say nothing more, which unsubscribes it. */
    const forget = useCallback((entry: PendingTask): void => {
        setPending((previous) => previous.filter((other) => other !== entry));
    }, []);

    /**
     * Resolves every song a terminal event names, and no song it does not.
     * Their channel may be shared, so an event carrying another task's id is
     * not ours, and only the ids this task carried can be answered here.
     */
    const onTaskEvent = useCallback(
        (entry: PendingTask, event: BulkEvent): void => {
            if (event.taskId !== null && event.taskId !== entry.task.taskId) {
                return;
            }

            const terminal = isTerminal(event.status);

            for (const song of entry.songs) {
                if (!entry.task.songIds.includes(song.songId)) {
                    continue;
                }

                if (!terminal) {
                    mark(song.songId, {
                        conflicts: song.conflicts,
                        edited: song.edited,
                        message: progressLine(song.queued, event.percent),
                        stage: holdingStage(song),
                    });
                    continue;
                }

                const verdict = verdictFor(event, song.songId);

                if (verdict.kind === "saved") {
                    adopt(song.songId, song.draft, entry.task.fields);
                }

                mark(song.songId, verdictNote(verdict, song));
            }

            if (terminal) {
                forget(entry);
            }
        },
        [adopt, forget, mark],
    );

    /** Nothing arrived, so the row keeps saying so rather than guessing. */
    const onTaskTimeout = useCallback(
        (entry: PendingTask): void => {
            for (const song of entry.songs) {
                mark(song.songId, {
                    conflicts: song.conflicts,
                    edited: song.edited,
                    message: timedOutLine(song.queued, TASK_TIMEOUT_MS / 1000),
                    stage: holdingStage(song),
                });
            }

            forget(entry);
        },
        [forget, mark],
    );

    /** Opens the dialog that collects the one value the column will take. */
    const onPick = (column: ColumnSpec, mode: FillMode): void => {
        setFillDraft(EMPTY_DRAFT);
        setFillTarget({ column, mode });
    };

    /** Stages one value across a column. Nothing here writes anything. */
    const applyFill = (
        column: ColumnSpec,
        mode: FillMode,
        source: SongDraft,
    ): void => {
        const patch = fieldPatch(source, column.field);
        const next: Record<number, RowState> = { ...rows };
        let filled = 0;
        let skipped = 0;

        for (const track of tracks) {
            const row = rows[track.songId];

            if (row === undefined || !canEdit(row.source, column.field)) {
                skipped += 1;
            } else if (
                mode === "empty" &&
                !isEmptyField(row.draft, column.field)
            ) {
                skipped += 1;
            } else {
                next[track.songId] = patchedRow(row, patch);
                filled += 1;
            }
        }

        setRows(next);
        setFillTarget(null);
        setMessage(
            `${FIELD_LABELS[column.field]}: staged on ${filled} ${plural(
                filled,
            )}${skipped === 0 ? "" : `, skipped ${skipped}`}`,
        );
    };

    /** The loaded rows, which are the only ones an import can stage onto. */
    const headers = [
        <th className="gp-pin-track" key="track">
            #
        </th>,
        ...COLUMNS.map((column) => (
            <th className={column.className ?? undefined} key={column.field}>
                <div className="gp-header">
                    <span>{FIELD_LABELS[column.field]}</span>
                    {column.fillable ? (
                        <ColumnMenu
                            column={column}
                            onPick={(mode) => {
                                onPick(column, mode);
                            }}
                        />
                    ) : null}
                </div>
            </th>
        )),
        <th key="row">Row</th>,
    ];

    const summary =
        dirtyCount === 0
            ? `${tracks.length} songs`
            : `${tracks.length} songs · ${dirtyCount} edited`;

    const launch = (): void => {
        setOpen(true);
        setOpened(true);
    };

    /** Throws away every staged edit, the stash with them. */
    const revertAll = (): void => {
        cancelStash();
        dropped.current = true;
        setRows((previous) => {
            const next: Record<number, RowState> = {};

            for (const [songId, row] of Object.entries(previous)) {
                next[Number(songId)] = revertedRow(row);
            }

            return next;
        });
        setNotice(false);
        setMessage(null);
        setSaves({});

        const cleared = clearStash(albumId);

        if (cleared.isErr()) {
            log.warn("draft stash", cleared.error.reason);
        }
    };

    /** Drops only what was restored, leaving anything staged since. */
    const discardRestored = (): void => {
        cancelStash();
        dropped.current = true;

        const next: Record<number, RowState> = { ...rows };

        for (const [songId, entry] of Object.entries(stashed)) {
            const row = next[Number(songId)];

            if (row !== undefined) {
                next[Number(songId)] = droppedRow(
                    row,
                    patchFields(entry.patch),
                );
            }
        }

        setRows(next);
        setNotice(false);
    };

    /** Genius renders this into the modal's own Controls slot. */
    const onSave = (): void => {
        const edits = editedRows();

        if (busy || edits.length === 0) {
            return;
        }

        setMessage(null);
        setPlan(planSave(edits));
    };

    const startSave = (confirmed: SavePlan): void => {
        const count = confirmed.writes.length;
        // Each note is pinned to the row as it was sent, so an edit made
        // while the write is in flight hides it rather than mislabelling it.
        const pinned = new Map(
            confirmed.writes.map((write) => [
                write.songId,
                rows[write.songId]?.edited ?? 0,
            ]),
        );

        setPlan(null);
        setSaving(true);
        setSaves({});
        setMessage(`Sending ${count} ${plural(count)} to Genius…`);

        void runSave(album.albumId, confirmed, (progress) => {
            const edited = pinned.get(progress.songId) ?? 0;
            const { task } = progress;

            // A field Genius has stored is Genius's value now, so it stops
            // being an edit and the next save never re-plans it. A queued
            // task has stored nothing yet, so its fields wait for Pusher.
            adopt(progress.songId, progress.draft, progress.written);

            const song: PendingSong = {
                conflicts: progress.conflicts,
                draft: progress.draft,
                edited,
                failed: progress.stage === "failed",
                queued: progress.message,
                songId: progress.songId,
            };
            /** Both have to hold, or nothing will ever answer this task. */
            const channel =
                !hasUsePusher() || task === null ? null : task.channel;

            if (task !== null && channel !== null) {
                setPending((previous) => [
                    ...previous,
                    { channel, songs: [song], task },
                ]);
            }

            mark(progress.songId, {
                conflicts: progress.conflicts,
                edited,
                message:
                    task === null
                        ? progress.message
                        : pendingLine(progress.message, channel !== null),
                stage: progress.stage,
            });
        }).then((outcome) => {
            setSaving(false);

            if (outcome.isErr()) {
                const line = describeSaveFailure(outcome.error);

                log.error("save refused", line);
                setMessage(line);
                return;
            }

            setMessage(describeOutcome(outcome.value));
        });
    };

    // Genius ships a separate mobile layout; this table is desktop only.
    // Read late, so a re-primed host is what decides after a restart.
    if (theme().deviceType === "mobile") {
        return <span hidden />;
    }

    const restoredCount = Object.keys(stashed).length;

    const table = (
        <Root>
            <div className="gp-head">
                <h2 className="gp-title">Genius+ Metadata Editor</h2>
                <p className="gp-sub">{summary}</p>
                <span className="gp-spacer" />
                <div className="gp-actions">
                    <Button
                        onClick={() => {
                            location.assign(importUrlFor(albumId));
                        }}
                        secondary
                        type="button"
                    >
                        Import from Apple Music
                    </Button>
                    {SAVE_ADAPTERS.map((adapter) => (
                        <Button
                            disabled={dirtyCount === 0 || saving}
                            key={adapter.id}
                            onClick={() => {
                                void adapter
                                    .run(editedRows())
                                    .then((outcome) => {
                                        setMessage(
                                            outcome.isOk()
                                                ? outcome.value
                                                : outcome.error.reason,
                                        );
                                    });
                            }}
                            secondary
                            type="button"
                        >
                            {adapter.label}
                        </Button>
                    ))}
                    <Button
                        disabled={dirtyCount === 0 || saving}
                        onClick={revertAll}
                        secondary
                        type="button"
                    >
                        Revert all
                    </Button>
                </div>
            </div>
            {notice ? (
                <div className="gp-notice">
                    <span>
                        {`Restored unsaved edits to ${restoredCount} ${plural(
                            restoredCount,
                        )} from this browser.`}
                    </span>
                    <Button onClick={discardRestored} secondary type="button">
                        Discard
                    </Button>
                    <Button
                        onClick={() => {
                            setNotice(false);
                        }}
                        secondary
                        type="button"
                    >
                        Dismiss
                    </Button>
                </div>
            ) : null}
            {message === null ? null : <p className="gp-message">{message}</p>}
            {tracks.length > 0 ? null : (
                <p className="gp-message">
                    This album has no songs yet. "Import from Apple Music" can
                    add them.
                </p>
            )}
            <div className="gp-scroll">
                <table>
                    <thead>
                        <tr>{headers}</tr>
                    </thead>
                    <tbody>
                        {tracks.map((track) => (
                            <SongRow
                                key={track.songId}
                                languageOptions={languageOptions}
                                load={loads[track.songId] ?? LOADING}
                                onPatch={onPatch}
                                onRetry={onRetry}
                                onRevert={onRevert}
                                primaryTagOptions={primaryTagOptions}
                                row={rows[track.songId] ?? null}
                                save={saves[track.songId] ?? null}
                                track={track}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </Root>
    );

    return (
        <>
            {!hasUsePusher()
                ? null
                : pending.map((entry) => (
                      <TaskWatch
                          key={entry.task.taskId}
                          onEvent={onTaskEvent}
                          onTimeout={onTaskTimeout}
                          pending={entry}
                      />
                  ))}
            {slot === null || reactDom === null ? (
                <Launch>
                    <Button onClick={launch} type="button">
                        Genius+ Metadata Editor
                    </Button>
                </Launch>
            ) : (
                reactDom.createPortal(
                    <button
                        className={slot.buttonClassName}
                        onClick={launch}
                        type="button"
                    >
                        Genius+ Metadata Editor
                    </button>,
                    slot.host,
                )
            )}
            {Modal === null || !open ? null : (
                <Modal
                    bodyWidth="min(96vw, 1180px)"
                    isSaveActive={dirtyCount > 0 && !busy}
                    onClose={() => {
                        setOpen(false);
                        dropEditorHash();
                    }}
                    onSave={onSave}
                    position="center"
                    saveLabel="Save"
                    show={open}
                >
                    {table}
                </Modal>
            )}
            {Modal === null || fillTarget === null ? null : (
                <Modal
                    bodyWidth="min(92vw, 34rem)"
                    isSaveActive
                    onClose={() => setFillTarget(null)}
                    onSave={() => {
                        applyFill(
                            fillTarget.column,
                            fillTarget.mode,
                            fillDraft,
                        );
                    }}
                    position="center"
                    saveLabel={
                        fillTarget.mode === "empty"
                            ? "Stage on empty rows"
                            : "Stage on every row"
                    }
                    show
                >
                    <FillDialog
                        column={fillTarget.column}
                        draft={fillDraft}
                        languageOptions={languageOptions}
                        mode={fillTarget.mode}
                        onPatch={(next) => {
                            setFillDraft((previous) => ({
                                ...previous,
                                ...next,
                            }));
                        }}
                        primaryTagOptions={primaryTagOptions}
                    />
                </Modal>
            )}
            {Modal === null || plan === null ? null : (
                <Modal
                    bodyWidth="min(92vw, 34rem)"
                    isSaveActive={plan.writes.length > 0}
                    onClose={() => setPlan(null)}
                    onSave={() => {
                        startSave(plan);
                    }}
                    position="center"
                    saveLabel="Send"
                    show
                >
                    <ConfirmDialog plan={plan} />
                </Modal>
            )}
        </>
    );
};

/** Cast once, so the page's `createElement` takes our own component. */
export const SongTable =
    asPageValue<PageComponent<SongTableProps>>(renderSongTable);

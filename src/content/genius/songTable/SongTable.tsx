/** The album table: its entry point, its modals, and its staged edits. */
import {
    asPageValue,
    getModal,
    getReactDom,
    type ModalProps,
    type PageComponent,
    type PageElement,
    type PageReactDom,
    type SelectOption,
} from "@/bindings";
import { log } from "@/utilities/log";
import { describeError } from "@/utilities/result";
import {
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
    writeStash,
} from "../draftStash";
import { Button, react } from "../geniusComponents";
import {
    describeLoadFailure,
    loadAlbumMetadata,
    loadSongMetadata,
    type SongMetadata,
} from "../metadata";
import { optionFor, optionLabel } from "../options";
import type { AlbumSeed } from "../pageState";
import { canEdit } from "../permissions";
import { host } from "../reactHost/host";
import { SAVE_ADAPTERS, type SongEdit } from "../saveAdapter";
import { observeToolbarSlot, type ToolbarSlot } from "../toolbarSlot";
import {
    planSave,
    restoreConflicts,
    runSave,
    type SaveOutcome,
    type SavePlan,
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

export interface SongTableProps {
    readonly album: AlbumSeed;
    /** From `GET /tags/home`; may be empty if the call failed. */
    readonly primaryTagOptions: readonly SelectOption[];
    /** Called during render: it reads the i18next store. */
    readonly useLanguageOptions: () => readonly SelectOption[];
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

    const detail =
        outcome.failed > 0 || outcome.conflicted > 0
            ? "; see the Row column"
            : "";

    return `Genius ${parts.join(", ")}${detail}`;
};

const initialLoads = (album: AlbumSeed): Readonly<Record<number, RowLoad>> => {
    const entries: [number, RowLoad][] = album.tracks.map((track) => [
        track.songId,
        LOADING,
    ]);

    return Object.fromEntries(entries);
};

const renderSongTable = (props: SongTableProps): PageElement => {
    const { album, primaryTagOptions, useLanguageOptions } = props;
    const albumId = album.albumId;

    const [loads, setLoads] = react.useState<Readonly<Record<number, RowLoad>>>(
        () => initialLoads(album),
    );
    /**
     * Every row's staged edit, held here rather than in the row. The table
     * outlives the modal, so closing it can no longer unmount an edit.
     */
    const [rows, setRows] = react.useState<Readonly<Record<number, RowState>>>(
        {},
    );
    const [message, setMessage] = react.useState<string | null>(null);
    const [open, setOpen] = react.useState(false);
    /** Latches on first open; the album is never fetched before. */
    const [opened, setOpened] = react.useState(false);
    const [Modal, setModal] = react.useState<PageComponent<ModalProps> | null>(
        null,
    );
    const [slot, setSlot] = react.useState<ToolbarSlot | null>(null);
    const [saves, setSaves] = react.useState<Readonly<Record<number, RowSave>>>(
        {},
    );
    /** Non-null only while the confirmation modal is open. */
    const [plan, setPlan] = react.useState<SavePlan | null>(null);
    const [saving, setSaving] = react.useState(false);
    const [reactDom, setReactDom] = react.useState<PageReactDom | null>(null);

    /** Read once, at mount: what a lost page left behind for this album. */
    const [stashed] = react.useState<Readonly<Record<number, StashedRow>>>(
        () => readStash(albumId)?.rows ?? {},
    );
    const [notice, setNotice] = react.useState(
        () => Object.keys(stashed).length > 0,
    );

    /** The rows as of the last commit, for the debounce and the unload guard. */
    const rowsRef = react.useRef<Readonly<Record<number, RowState>>>({});
    const dirtyRef = react.useRef(0);
    /** Set once the user throws a restore away, so it is never carried on. */
    const dropped = react.useRef(false);
    /** Cleared after the first commit, which stages nothing of its own. */
    const armed = react.useRef(false);
    const stashTimer = react.useRef<ReturnType<typeof setTimeout> | null>(null);

    /** Non-null only while the column fill dialog is open. */
    const [fillTarget, setFillTarget] = react.useState<{
        readonly column: ColumnSpec;
        readonly mode: FillMode;
    } | null>(null);
    /** A scratch draft the fill dialog's editor writes one field of. */
    const [fillDraft, setFillDraft] = react.useState<SongDraft>(EMPTY_DRAFT);

    const persist = react.useCallback((): void => {
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
            log.warn("draft stash", describeError(wrote.error));
        }
    }, [albumId, stashed]);

    const cancelStash = react.useCallback((): void => {
        if (stashTimer.current !== null) {
            clearTimeout(stashTimer.current);
            stashTimer.current = null;
        }
    }, []);

    const scheduleStash = react.useCallback((): void => {
        cancelStash();
        stashTimer.current = setTimeout(() => {
            stashTimer.current = null;
            persist();
        }, STASH_DELAY_MS);
    }, [cancelStash, persist]);

    // The rows a debounced write will read, published before it is armed.
    react.useEffect(() => {
        rowsRef.current = rows;

        // Merely visiting the page must not refresh the stash's own clock.
        if (armed.current) {
            scheduleStash();
        }

        armed.current = true;
    }, [rows, scheduleStash]);

    // A client side navigation unmounts this tree without any warning,
    // so a pending debounce has to land before the table goes.
    react.useEffect(
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
    react.useEffect(() => guardUnload(() => dirtyRef.current > 0), []);

    react.useEffect(() => observeToolbarSlot(setSlot), []);

    react.useEffect(() => {
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

    react.useEffect(() => {
        let live = true;

        void getModal().then((found) => {
            if (!live) {
                return;
            }

            if (found.isOk()) {
                setModal(() => found.value);
                return;
            }

            log.error("modal unavailable", describeError(found.error));
            setMessage(describeError(found.error));
        });

        return () => {
            live = false;
        };
    }, []);

    const freshLanguageOptions = useLanguageOptions();
    // The hook rebuilds its array each render, which a memoised row would
    // read as a new prop every time.
    const [languageOptions, setLanguageOptions] =
        react.useState(freshLanguageOptions);

    if (languageOptions.length !== freshLanguageOptions.length) {
        setLanguageOptions(freshLanguageOptions);
    }

    const record = react.useCallback(
        (songId: number, result: RowLoad): void => {
            setLoads((previous) => ({ ...previous, [songId]: result }));
        },
        [],
    );

    // `album` never changes while this tree is mounted, so it is no dep.
    react.useEffect(() => {
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
                              message: describeLoadFailure(result.error),
                              status: "error",
                          },
                );
            },
        );

        return () => {
            live = false;
        };
    }, [opened, record]);

    const onRetry = react.useCallback(
        (songId: number): void => {
            record(songId, LOADING);

            void loadSongMetadata(songId).then((result) => {
                record(
                    songId,
                    result.isOk()
                        ? { metadata: result.value, status: "ready" }
                        : {
                              message: describeLoadFailure(result.error),
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
    const stale = album.tracks.filter((track) => {
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
        album.tracks.flatMap((track) => {
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

    const dirtyCount = album.tracks.filter(
        (track) => (rows[track.songId]?.changed.length ?? 0) > 0,
    ).length;

    // Read at navigation time by the unload guard, which has no render.
    react.useEffect(() => {
        dirtyRef.current = dirtyCount;
    }, [dirtyCount]);

    const onPatch = react.useCallback(
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

    const onRevert = react.useCallback((songId: number): void => {
        setRows((previous) => {
            const row = previous[songId];

            return row === undefined
                ? previous
                : { ...previous, [songId]: revertedRow(row) };
        });
    }, []);

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

        for (const track of album.tracks) {
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
            ? `${album.tracks.length} songs`
            : `${album.tracks.length} songs · ${dirtyCount} edited`;

    const launch = (): void => {
        setOpen(true);
        setOpened(true);
    };

    const mark = (songId: number, next: RowSave): void => {
        setSaves((previous) => ({ ...previous, [songId]: next }));
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
            log.warn("draft stash", describeError(cleared.error));
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

        if (edits.length === 0) {
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
            // A field Genius has taken is Genius's value now, so it stops
            // being an edit and the next save never re-plans it.
            if (progress.written.length > 0) {
                setRows((previous) => {
                    const row = previous[progress.songId];

                    return row === undefined
                        ? previous
                        : {
                              ...previous,
                              [progress.songId]: savedRow(
                                  row,
                                  progress.draft,
                                  progress.written,
                              ),
                          };
                });
            }

            mark(progress.songId, {
                conflicts: progress.conflicts,
                edited: pinned.get(progress.songId) ?? 0,
                message: progress.message,
                stage: progress.stage,
            });
        }).then((outcome) => {
            setSaving(false);

            if (outcome.isErr()) {
                log.error("save refused", describeError(outcome.error));
                setMessage(describeError(outcome.error));
                return;
            }

            setMessage(describeOutcome(outcome.value));
        });
    };

    // Genius ships a separate mobile layout; this table is desktop only.
    // Read late, so a re-primed host is what decides after a restart.
    if (host.theme.deviceType === "mobile") {
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
                                                : describeError(outcome.error),
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
            <div className="gp-scroll">
                <table>
                    <thead>
                        <tr>{headers}</tr>
                    </thead>
                    <tbody>
                        {album.tracks.map((track) => (
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
                    isSaveActive={dirtyCount > 0 && !saving}
                    onClose={() => setOpen(false)}
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

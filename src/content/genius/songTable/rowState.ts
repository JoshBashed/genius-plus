/** One row's staged edit, owned by the table so a closed modal cannot lose it. */
import {
    changedFields,
    DRAFT_FIELDS,
    type DraftField,
    draftFromMetadata,
    fieldsPatch,
    type SongDraft,
    withoutFields,
} from "../draft";
import type { StashedRow } from "../draftStash";
import type { SongMetadata } from "../metadata";

export interface RowState {
    /** The record the baseline came from; its identity says it is current. */
    readonly source: SongMetadata;
    /** Genius's values, as last read or as last accepted from us. */
    readonly baseline: SongDraft;
    /** Only the fields the user has touched, applied over `baseline`. */
    readonly patch: Partial<SongDraft>;
    /** `baseline` under `patch`, derived once so it has a single identity. */
    readonly draft: SongDraft;
    readonly changed: readonly DraftField[];
    /** Bumped by every user edit, so a stale save note can hide itself. */
    readonly edited: number;
    /** The baseline a restored patch was staged against, until it is edited. */
    readonly restored: SongDraft | null;
}

interface RowParts {
    readonly source: SongMetadata;
    readonly baseline: SongDraft;
    readonly patch: Partial<SongDraft>;
    readonly edited: number;
    readonly restored: SongDraft | null;
}

const rowState = (parts: RowParts): RowState => {
    const draft: SongDraft = { ...parts.baseline, ...parts.patch };

    return {
        baseline: parts.baseline,
        changed: changedFields(parts.baseline, draft),
        draft,
        edited: parts.edited,
        patch: parts.patch,
        restored: parts.restored,
        source: parts.source,
    };
};

/**
 * A row as it stands the moment its metadata first lands.
 * @param stashed What a lost page left for this song, restored over the fresh
 * baseline so an untouched field always reads as Genius currently has it.
 */
export const openedRow = (
    source: SongMetadata,
    stashed: StashedRow | null,
): RowState =>
    rowState({
        baseline: draftFromMetadata(source),
        edited: 0,
        patch: stashed?.patch ?? {},
        restored: stashed?.baseline ?? null,
        source,
    });

/** Adopts a freshly read baseline, keeping whatever the user staged. */
export const reloadedRow = (row: RowState, source: SongMetadata): RowState =>
    rowState({ ...row, baseline: draftFromMetadata(source), source });

/** One user edit: the patch grows, and any note pinned to the row goes stale. */
export const patchedRow = (row: RowState, next: Partial<SongDraft>): RowState =>
    rowState({
        ...row,
        edited: row.edited + 1,
        patch: { ...row.patch, ...next },
        restored: null,
    });

/** Throws named fields out of the patch, leaving anything staged beside them. */
export const droppedRow = (
    row: RowState,
    fields: readonly DraftField[],
): RowState =>
    rowState({
        ...row,
        edited: row.edited + 1,
        patch: withoutFields(row.patch, fields),
        restored: null,
    });

export const revertedRow = (row: RowState): RowState =>
    droppedRow(row, DRAFT_FIELDS);

/**
 * Folds fields Genius has taken into the baseline, so the row reads clean.
 * The patch keeps them, so an edit made while the write was in flight still
 * counts as a change and the next save plans it again.
 * @param written Only the fields an endpoint actually accepted.
 */
export const savedRow = (
    row: RowState,
    draft: SongDraft,
    written: readonly DraftField[],
): RowState =>
    rowState({
        ...row,
        baseline: { ...row.baseline, ...fieldsPatch(draft, written) },
    });

/** What the stash should hold for this row, or `null` when it is clean. */
export const stashedRowOf = (row: RowState): StashedRow | null =>
    row.changed.length === 0
        ? null
        : {
              baseline: row.baseline,
              patch: fieldsPatch(row.draft, row.changed),
          };

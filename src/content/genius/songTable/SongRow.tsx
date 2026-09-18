/** One song's row: an editor per column, and its own write status. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SelectOption,
} from "@/bindings";
import { cleanSoundcloudUrl } from "@/utilities/soundcloudUrl";
import { FIELD_LABELS, type SongDraft } from "../draft";
import { react, SmallButton, Spinner } from "../geniusComponents";
import type { SongMetadata } from "../metadata";
import type { TrackSeed } from "../pageState";
import { canEdit, permissionsKnown } from "../permissions";
import { type FieldConflict, invalidFields, type SaveStage } from "../write";
import { ColumnEditor, withCurrent } from "./ColumnEditor";
import { COLUMNS } from "./columns";
import type { RowState } from "./rowState";

/** The last note a row was given, pinned to the edit it was given for. */
export interface RowSave {
    readonly stage: SaveStage;
    readonly message: string;
    /** The row's edit count when it was recorded; a later edit hides it. */
    readonly edited: number;
    readonly conflicts: readonly FieldConflict[];
}

export type RowLoad =
    | { readonly status: "loading" }
    | { readonly status: "error"; readonly message: string }
    | { readonly status: "ready"; readonly metadata: SongMetadata };

/** The write mark's classes: green when queued, accent when nothing landed. */
const stageClass = (stage: SaveStage): string => {
    switch (stage) {
        case "saved":
        case "queued":
            return "gp-row-note gp-queued";
        case "canceled":
        case "conflict":
        case "failed":
            return "gp-row-note gp-error";
        default:
            return "gp-row-note";
    }
};

const smallButton = (label: string, onClick: () => void): PageElement => (
    <SmallButton onClick={onClick} type="button">
        {label}
    </SmallButton>
);

export interface RowProps {
    readonly track: TrackSeed;
    readonly load: RowLoad;
    /** The table's copy of this row's edit; `null` until its metadata lands. */
    readonly row: RowState | null;
    readonly save: RowSave | null;
    readonly languageOptions: readonly SelectOption[];
    /** From `GET /tags/home`; may be empty if the call failed. */
    readonly primaryTagOptions: readonly SelectOption[];
    readonly onPatch: (songId: number, next: Partial<SongDraft>) => void;
    readonly onRevert: (songId: number) => void;
    readonly onRetry: (songId: number) => void;
}

const renderSongRow = (props: RowProps): PageElement => {
    const { load, onPatch, onRetry, onRevert, row, save, track } = props;

    /** Only changed fields matter: an untouched field is never sent. */
    const problems = react.useMemo(
        () =>
            row === null
                ? []
                : invalidFields(row.draft).filter((entry) =>
                      row.changed.includes(entry.field),
                  ),
        [row],
    );

    /** The cleaned form, only when it differs from what is staged. */
    const dirtyUrl = react.useMemo(() => {
        const raw = row?.draft.soundcloudUrl ?? null;

        if (raw === null) {
            return null;
        }

        const cleaned = cleanSoundcloudUrl(raw);

        return cleaned === raw ? null : cleaned;
    }, [row]);

    const patch = react.useCallback(
        (next: Partial<SongDraft>): void => {
            onPatch(track.songId, next);
        },
        [onPatch, track.songId],
    );

    const changed = row === null ? [] : row.changed;

    const trackCell = (
        <td className="gp-pin-track" data-dirty={changed.length > 0}>
            <div className="gp-track-content">
                {track.trackNumber === null ? "–" : String(track.trackNumber)}
            </div>
        </td>
    );

    if (row === null) {
        return (
            <tr>
                {trackCell}
                <td className="gp-pin-title">
                    <span className="gp-plain">{track.title}</span>
                </td>
                <td colSpan={COLUMNS.length}>
                    {load.status === "error" ? (
                        <span className="gp-row-note gp-error">
                            {load.message}
                            {smallButton("Retry", () => {
                                onRetry(track.songId);
                            })}
                        </span>
                    ) : (
                        <span className="gp-row-note">
                            <Spinner />
                            {"Loading metadata…"}
                        </span>
                    )}
                </td>
            </tr>
        );
    }

    // A re-read leaves the row's editors up rather than blanking them, so
    // the edit it was showing stays on screen; the note below says it is busy.
    const { draft, source: metadata } = row;
    const stale = save === null || save.edited !== row.edited;
    const languageOptions = withCurrent(
        props.languageOptions,
        metadata.language,
        metadata.language,
    );
    const primaryTagOptions = withCurrent(
        props.primaryTagOptions,
        metadata.primaryTag?.id ?? null,
        metadata.primaryTag?.name ?? null,
    );

    return (
        <tr>
            {trackCell}
            {COLUMNS.map((column) => (
                <td
                    className={column.className ?? undefined}
                    key={column.field}
                    style={{ minWidth: column.width }}
                >
                    <div className="gp-stack">
                        <ColumnEditor
                            column={column}
                            disabled={!canEdit(metadata, column.field)}
                            draft={draft}
                            hasError={problems.some(
                                (entry) => entry.field === column.field,
                            )}
                            languageOptions={languageOptions}
                            onPatch={patch}
                            primaryTagOptions={primaryTagOptions}
                        />
                        {column.field !== "soundcloudUrl" ||
                        dirtyUrl === null ||
                        !canEdit(metadata, "soundcloudUrl") ? null : (
                            <span className="gp-row-note gp-flag">
                                {"Has tracking params"}
                                {smallButton("Clean", () => {
                                    patch({ soundcloudUrl: dirtyUrl });
                                })}
                            </span>
                        )}
                    </div>
                </td>
            ))}
            <td style={{ minWidth: "10rem" }}>
                <div className="gp-stack">
                    {changed.length === 0 ? (
                        <span className="gp-row-note">No changes</span>
                    ) : (
                        <span className="gp-row-note">
                            {`${changed.length} edited`}
                            {smallButton("Revert", () => {
                                onRevert(track.songId);
                            })}
                        </span>
                    )}
                    {load.status === "loading" ? (
                        <span className="gp-row-note">
                            <Spinner />
                            {"Re-reading…"}
                        </span>
                    ) : null}
                    {load.status === "error" ? (
                        <span className="gp-row-note gp-error">
                            {load.message}
                            {smallButton("Retry", () => {
                                onRetry(track.songId);
                            })}
                        </span>
                    ) : null}
                    {problems.map((entry) => (
                        <span
                            className="gp-row-note gp-error"
                            key={entry.field}
                        >
                            {`${FIELD_LABELS[entry.field]} cannot be saved: ${
                                entry.reason
                            }`}
                        </span>
                    ))}
                    {permissionsKnown(metadata) ? null : (
                        <span
                            className="gp-row-note gp-flag"
                            title={
                                "Genius did not say what you may edit here, " +
                                "so nothing is blocked and the server decides."
                            }
                        >
                            Permissions unknown
                        </span>
                    )}
                    {save === null || stale ? null : (
                        <span className={stageClass(save.stage)}>
                            {save.message}
                        </span>
                    )}
                    {save === null ||
                    stale ||
                    save.conflicts.length === 0 ? null : (
                        <span className="gp-conflict">
                            {save.conflicts.map((entry) => (
                                <span key={entry.field}>
                                    <b>{FIELD_LABELS[entry.field]}</b>
                                    {`yours: ${entry.mine || "(empty)"}`}
                                    {`now on Genius: ${entry.current || "(empty)"}`}
                                </span>
                            ))}
                            {smallButton("Reload row", () => {
                                onRetry(track.songId);
                            })}
                        </span>
                    )}
                </div>
            </td>
        </tr>
    );
};

/**
 * Memoised: the table owns every row's edit, so one keystroke re-renders it.
 * Every prop but `row` is shared and stable, so only the edited row repaints.
 */
export const SongRow = react.memo(
    asPageValue<PageComponent<RowProps>>(renderSongRow),
);

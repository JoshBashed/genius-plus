/** The import itself: create what is missing, then stage the rest. */
import { Result } from "@resulted/results";
import type { DateComponents } from "@/bindings";
import { log } from "@/utilities/log";
import {
    type AlbumTracksFailure,
    describeAlbumTracksFailure,
    loadAlbumTracks,
} from "../albumImport/albumTracks";
import type { ContributorPlan } from "../albumImport/contributors";
import type { AlbumCredits } from "../albumImport/credits";
import type { ImportedAlbum } from "../albumImport/importedAlbum";
import { type TrackMatch, titleKey } from "../albumImport/matchTracks";
import {
    IMPORT_FIELDS,
    type StageRow,
    stageImport,
} from "../albumImport/stage";
import {
    describeTracklistFailure,
    planTracklist,
    putTracklist,
    type TracklistAppearance,
    type TracklistFailure,
    type TracklistPlan,
} from "../albumImport/tracklist";
import {
    changedFields,
    type DraftField,
    draftFromMetadata,
    fieldsPatch,
    type SongDraft,
} from "../draft";
import {
    readStash,
    type StashedRow,
    type StashedTask,
    writeStash,
    writeTasks,
} from "../draftStash";
import { EDITOR_HASH } from "../importRoute";
import { loadAlbumMetadata, type SongMetadata } from "../metadata";
import { loadPrimaryTagOptions, optionLabel } from "../options";
import type { SongEdit } from "../saveAdapter";
import {
    describeSaveFailure,
    planSave,
    runSave,
    type SaveOutcome,
} from "../write";
import {
    describeCoverArtFailure,
    uploadCoverArt,
    wantsCoverArt,
} from "./coverArt";
import { describeGeniusAlbumFailure, loadGeniusAlbum } from "./geniusAlbums";
import type { AlbumType, CoverArt } from "./updateAlbum";
import { describeUpdateAlbumFailure, updateAlbum } from "./updateAlbum";

/**
 * Every way an import stops: the reads, the tracklist write, the stash.
 *
 * Flat by design: nothing here forwards a lower layer's error, and each
 * variant carries only what its own line has to say.
 */
export type ImportFailure =
    /** The album could not be read, before or after the write. */
    | { readonly kind: "albumUnread"; readonly reason: string }
    /** The tracklist write did not go through. */
    | { readonly kind: "tracklistUnwritten"; readonly reason: string }
    /** The album read back with no song this import could stage onto. */
    | { readonly kind: "noSongs"; readonly albumId: number }
    /** The staged edits had nowhere to wait for the album's editor. */
    | { readonly kind: "unstashed"; readonly reason: string }
    /** Genius would not take the edits at all. */
    | { readonly kind: "unsaved"; readonly reason: string };

/** One line naming why an import did not run. */
export const describeImportFailure = (error: ImportFailure): string => {
    switch (error.kind) {
        case "albumUnread":
            return error.reason;
        case "tracklistUnwritten":
            return error.reason;
        case "noSongs":
            return `Genius listed no readable song on album ${error.albumId}`;
        case "unstashed":
            return `The staged edits could not be kept: ${error.reason}`;
        case "unsaved":
            return error.reason;
    }
};

/**
 * Why an import that ran staged nothing at all.
 * Every one of these was silent before, and told apart only by there
 * being no edits waiting on the album.
 */
export const describeEmptyImport = (outcome: ImportOutcome): string => {
    const parts: string[] = [];

    if (outcome.blocked.length > 0) {
        parts.push(
            `your account may not edit ${outcome.blocked.join(", ")} here`,
        );
    }

    if (outcome.unpaired > 0) {
        parts.push(`${outcome.unpaired} of Apple's tracks matched no song`);
    }

    return parts.length === 0
        ? "Nothing to change: the album already says everything Apple does."
        : `Nothing was staged: ${parts.join("; ")}.`;
};

const albumUnread = (error: AlbumTracksFailure): ImportFailure => ({
    kind: "albumUnread",
    reason: describeAlbumTracksFailure(error),
});

/**
 * Each Apple track against the song their tracklist answer placed there.
 *
 * Their `album_appearances` number a song per position, and the entries
 * were sent in that order, so position binds them. Matching a created
 * song by title instead put two tracks whose names normalise alike on
 * one song id, staging it twice and leaving the other empty.
 *
 * @returns An empty map when the answer does not line up, which leaves
 * the caller on its title fallback rather than on a wrong pairing.
 */
const bindPlacements = (
    plan: TracklistPlan,
    placements: readonly TracklistAppearance[],
): ReadonlyMap<number, number> => {
    const bound = new Map<number, number>();

    if (placements.length !== plan.entries.length) {
        return bound;
    }

    // By position, not by `track_number`: that number is per disc, so
    // keying on it put disc one's rows on disc two's songs.
    plan.keys.forEach((key, index) => {
        const placed = placements[index];

        if (key !== null && placed !== undefined) {
            bound.set(key, placed.songId);
        }
    });

    return bound;
};

/**
 * The album's stash with this import's rows folded in.
 *
 * A field the reader already staged themselves wins: their patch is an
 * edit they made and ours is a value they can see us propose. Replacing
 * the key outright threw their unsaved table away.
 */
const mergeStash = (
    current: Readonly<Record<number, StashedRow>>,
    ours: Readonly<Record<number, StashedRow>>,
): Record<number, StashedRow> => {
    const merged: Record<number, StashedRow> = { ...current };

    for (const [songId, row] of Object.entries(ours)) {
        const theirs = merged[Number(songId)];

        merged[Number(songId)] =
            theirs === undefined
                ? row
                : {
                      baseline: theirs.baseline,
                      patch: { ...row.patch, ...theirs.patch },
                  };
    }

    return merged;
};

const tracklistUnwritten = (error: TracklistFailure): ImportFailure => ({
    kind: "tracklistUnwritten",
    reason: describeTracklistFailure(error),
});

export interface RunImportOptions {
    readonly album: ImportedAlbum;
    /** As the user left it, not as resolution first guessed it. */
    readonly contributors: ContributorPlan;
    /** Per track writers and producers. Apple has them nowhere else, so
     * without these two of the four credit columns stay empty. */
    readonly credits: AlbumCredits;
    readonly albumId: number;
    /** `empty` only fills a field holding nothing; `all` overwrites it. */
    readonly mode: "empty" | "all";
    /** The tag the reader chose, not one guessed from Apple's genre. */
    readonly primaryTagId: number;
    /** Each Apple track against the song it is, as the reader settled it. */
    readonly matches: readonly TrackMatch[];
    /** The album's own URL, which is the only one Genius serves. */
    readonly albumUrl: string | null;
    /** Their own kind for it, when the reader said which. */
    readonly albumType: AlbumType | null;
    /** Genius's own language code, when the reader picked one. */
    readonly language: string | null;
    readonly onProgress: (line: string) => void;
}

/** What an import left behind, which is not always an edit. */
export interface ImportOutcome {
    /** Where to send the browser, once there is a reason to go. */
    readonly url: string;
    /** Rows with at least one field the album's editor will show. */
    readonly staged: number;
    /** Fields dropped because this viewer may not edit them. */
    readonly blocked: readonly string[];
    /** Apple tracks that paired with no song on the album. */
    readonly unpaired: number;
    /** What Genius did with the rows that were sent. */
    readonly outcome: SaveOutcome | null;
    /**
     * What went wrong beside the songs, in the reader's own terms.
     * The cover and the album's own record were only ever logged, so an
     * import that set neither still looked like it had worked.
     */
    readonly warnings: readonly string[];
}

/** Whether an album already states a release date of its own. */
const hasDate = (date: DateComponents | null): boolean =>
    date !== null && date.year !== null;

/**
 * Creates the missing songs, then writes every field onto every row.
 *
 * The edits go through the album editor's own `planSave` and `runSave`,
 * so permissions, the conflict re-read and the Pusher confirmation are
 * the ones already written. The stash is only a net: merged in before
 * the save, pruned afterwards to the rows Genius stored outright.
 *
 * @returns What it did and where to send the browser, or why it could
 * not run.
 */
export const runImport = async (
    options: RunImportOptions,
): Promise<Result<ImportOutcome, ImportFailure>> => {
    const { album, albumId, albumType, mode, onProgress } = options;
    /** Everything worth saying that is not worth stopping for. */
    const warnings: string[] = [];

    onProgress("Reading the album from Genius…");

    // Read before anything is written: its roles ride along on the
    // tracklist write, and `empty` needs to know what it already says.
    const record = await loadGeniusAlbum(albumId);

    if (record.isErr()) {
        log.warn(
            "genius: album record",
            describeGeniusAlbumFailure(record.error),
        );
    }

    const known = record.isErr() ? null : record.value;
    const before = await loadAlbumTracks(albumId);

    if (before.isErr()) {
        return Result.err(albumUnread(before.error));
    }

    // A second run must not re-create what the first one made. A row
    // with no song of its own is looked for on the album under the name
    // it would be created with, so a run that failed after the
    // tracklist write finds those songs rather than making them twice.
    const onAlbum = new Map(
        before.value.map((seed) => [titleKey(seed.title), seed.songId]),
    );
    const wanted = options.matches.map((match) => ({
        ...match,
        songId: match.songId ?? onAlbum.get(titleKey(match.title)) ?? null,
    }));
    const planned = planTracklist(wanted, before.value);
    const had = new Set(before.value.map((seed) => seed.songId));

    // Always, not only when something is created: this one call both
    // creates and orders, and an album whose songs all exist is exactly
    // the one whose tracks are sitting there unnumbered.
    /** Apple's track key against the song the tracklist call made for it. */
    let placed: ReadonlyMap<number, number> = new Map();

    if (planned.entries.length > 0) {
        const count = planned.created.length;

        onProgress(
            count === 0
                ? "Ordering the tracklist…"
                : `Creating ${count} song${count === 1 ? "" : "s"}…`,
        );

        // Without the record there is no way to know what the album is
        // restricted to, and sending `[]` would lift the restriction.
        if (known === null) {
            return Result.err({
                kind: "albumUnread",
                reason:
                    "The album's own record could not be read, and its " +
                    "tracklist will not be written without it",
            });
        }

        const written = await putTracklist(
            albumId,
            planned.entries,
            known.viewableByRoles,
        );

        if (written.isErr()) {
            return Result.err(tracklistUnwritten(written.error));
        }

        placed = bindPlacements(planned, written.value);
    }

    onProgress("Reading the album back…");

    const after = await loadAlbumTracks(albumId);

    if (after.isErr()) {
        return Result.err(albumUnread(after.error));
    }

    // Their answer first, which names a song per position and so tells
    // two tracks of the same name apart. The title is only a fallback,
    // for an answer that came back in a shape we could not line up.
    const bySongId = new Map(
        after.value.map((seed) => [titleKey(seed.title), seed.songId]),
    );
    const matched = {
        matches: wanted.map((match) => ({
            ...match,
            songId:
                match.songId ??
                placed.get(match.imported.key) ??
                bySongId.get(titleKey(match.title)) ??
                null,
        })),
    };
    const fresh = new Set(
        after.value
            .map((seed) => seed.songId)
            .filter((songId) => !had.has(songId)),
    );

    onProgress(`Reading ${after.value.length} songs…`);

    const rows = new Map<number, StageRow>();
    const sources = new Map<number, SongMetadata>();

    await loadAlbumMetadata(
        after.value.map((seed) => seed.songId),
        (songId, result) => {
            if (result.isErr()) {
                return;
            }

            sources.set(songId, result.value);
            rows.set(songId, {
                draft: draftFromMetadata(result.value),
                metadata: result.value,
                songId,
            });
        },
    );

    if (rows.size === 0) {
        return Result.err({ albumId, kind: "noSongs" });
    }

    const { contributors } = options;
    const tagId = options.primaryTagId;
    const staged = stageImport(matched.matches, contributors, rows, tagId, {
        credits: options.credits,
        fields: IMPORT_FIELDS,
        fresh,
        language: options.language,
        mode,
    });

    if (staged.blocked.length > 0) {
        log.warn("genius: import blocked", staged.blocked.join(", "));
    }

    if (staged.unpaired > 0) {
        log.warn(
            "genius: import unpaired",
            `${staged.unpaired} Apple tracks matched no song on the album`,
        );
    }

    // Their own name for the tag, which a write states beside its id.
    const tagOptions = await loadPrimaryTagOptions();
    const tagName = tagOptions.find((option) => option.value === tagId);

    // The stash is written first and cleared after: a save that fails
    // partway leaves the rest where the album's editor will find it,
    // rather than losing the run.
    const stash: Record<number, StashedRow> = {};
    const edits: SongEdit[] = [];

    for (const patch of staged.patches) {
        const source = sources.get(patch.songId);

        if (source === undefined) {
            continue;
        }

        // Staged is not the same as changed: a field set to what the
        // song already says is no edit, and a row of them is a draft
        // the reader would open, read, and find nothing in.
        const baseline = draftFromMetadata(source);
        const draft = { ...baseline, ...patch.patch };
        const moved = changedFields(baseline, draft);

        if (moved.length === 0) {
            continue;
        }

        stash[patch.songId] = {
            baseline,
            patch: fieldsPatch(draft, moved),
        };
        edits.push({
            baseline,
            draft,
            metadata: source,
            originalTitle: source.title,
            primaryTagName:
                tagName === undefined ? null : optionLabel(tagName.label),
            songId: patch.songId,
            trackNumber: null,
            url: null,
        });
    }

    const stagedRows = edits.length;
    // Merged, never replaced: an editor's own unsaved drafts live under
    // this same album key, and a field they touched is theirs, not ours.
    const kept = mergeStash(readStash(albumId)?.rows ?? {}, stash);

    if (stagedRows > 0) {
        const wrote = writeStash(albumId, kept);

        if (wrote.isErr()) {
            return Result.err({
                kind: "unstashed",
                reason: wrote.error.reason,
            });
        }
    }

    // The same path the album's own editor saves by, so permissions,
    // the re-read against a conflict, and the Pusher confirmation are
    // all the ones already written rather than a second set.
    let outcome: SaveOutcome | null = null;

    if (stagedRows > 0) {
        const plan = planSave(edits);

        if (plan.writes.length === 0) {
            const why = plan.skipped
                .map((one) => `${one.field}: ${one.reason}`)
                .join("; ");

            return Result.err({
                kind: "unsaved",
                reason:
                    why === ""
                        ? "Genius would take none of these edits"
                        : `Genius would take none of these edits. ${why}`,
            });
        }

        onProgress(`Saving ${plan.writes.length} songs…`);

        // Only a row Genius stored outright is done with. `queued` is
        // accepted, not applied, and its rejection arrives over Pusher
        // long after this page has gone, so it stays stashed.
        /** Per song, the fields an endpoint actually stored. */
        const stored = new Map<number, Set<DraftField>>();
        const queued: StashedTask[] = [];
        const sent = await runSave(albumId, plan, (progress) => {
            if (progress.stage === "checking") {
                return;
            }

            // `written` and not the stage: a row can store some fields
            // and hold others back, and only the stored ones are done.
            if (progress.written.length > 0) {
                const fields =
                    stored.get(progress.songId) ?? new Set<DraftField>();

                for (const field of progress.written) {
                    fields.add(field);
                }

                stored.set(progress.songId, fields);
            }

            // Left for the album's own table, which is the only thing
            // that can subscribe once this page has gone.
            if (progress.task !== null && progress.task.channel !== null) {
                queued.push({
                    channel: progress.task.channel,
                    fields: progress.task.fields,
                    queued: progress.message,
                    songIds: progress.task.songIds,
                    taskId: progress.task.taskId,
                });
            }

            onProgress(`Saving: ${progress.message}`);
        });

        if (sent.isErr()) {
            return Result.err({
                kind: "unsaved",
                reason: describeSaveFailure(sent.error),
            });
        }

        outcome = sent.value;

        // Field by field, not row by row. A row can carry fields the
        // album's own editor staged and fields this save held back, and
        // dropping the whole row took those with it.
        const remaining: Record<number, StashedRow> = {};

        for (const [songId, row] of Object.entries(kept)) {
            const fields = stored.get(Number(songId));

            if (fields === undefined) {
                remaining[Number(songId)] = row;
                continue;
            }

            const patch: { -readonly [Key in DraftField]?: SongDraft[Key] } = {
                ...row.patch,
            };

            for (const field of fields) {
                delete patch[field];
            }

            if (Object.keys(patch).length > 0) {
                remaining[Number(songId)] = { baseline: row.baseline, patch };
            }
        }

        const rewrote = writeStash(albumId, remaining);

        if (rewrote.isErr()) {
            log.warn("genius: draft stash", rewrote.error.reason);
        }

        const left = writeTasks(albumId, queued);

        if (left.isErr()) {
            log.warn("genius: queued tasks", left.error.reason);
        }
    }

    onProgress("Updating the album…");

    // Re-read for the covers: `cover_arts` replaces the whole set, so
    // one left out of the write is one deleted.
    const latest = await loadGeniusAlbum(albumId);

    if (latest.isErr()) {
        warnings.push(describeGeniusAlbumFailure(latest.error));
    }

    const current = latest.isErr() ? null : latest.value;
    const existing = current?.coverArtUrls ?? null;
    let covers: readonly CoverArt[] | null = null;

    if (existing !== null && wantsCoverArt(existing, album.artworkUrl, mode)) {
        onProgress("Uploading the cover…");

        const uploaded = await uploadCoverArt(album, existing);

        if (uploaded.isErr()) {
            warnings.push(describeCoverArtFailure(uploaded.error));
        } else {
            covers = uploaded.value;
        }
    }

    // `empty` means empty here too. Overwriting an album's own date and
    // kind whatever the reader asked for was the mode being ignored at
    // exactly the level where it is least recoverable.
    const overwrite = mode === "all";
    const setsDate = overwrite || !hasDate(current?.releaseDate ?? null);
    const setsType =
        albumType !== null &&
        (overwrite ||
            current?.albumType === null ||
            current?.albumType === undefined ||
            current.albumType === "");

    // Its own record, which the tracklist call does not touch. A failure
    // here is worth saying but not worth failing the import over.
    const updated = await updateAlbum(albumId, {
        ...(setsDate ? { release_date_components: album.releaseDate } : {}),
        ...(setsType ? { album_type: albumType } : {}),
        ...(covers === null ? {} : { cover_arts: covers }),
        ...(options.language === null ? {} : { language: options.language }),
    });

    if (updated.isErr()) {
        warnings.push(describeUpdateAlbumFailure(updated.error));
    }

    // Their album URLs are `/albums/<artist>/<album>`; the id is not a
    // path Genius serves, so the record's own URL is the only one.
    const where =
        options.albumUrl ??
        current?.url ??
        known?.url ??
        `${location.origin}/albums/${albumId}`;

    // Queued counts as pending: a bulk write is accepted, not applied,
    // and only the album's own table is listening for how it ended.
    const pending =
        outcome !== null &&
        (outcome.failed > 0 || outcome.conflicted > 0 || outcome.queued > 0);

    return Result.ok({
        blocked: staged.blocked,
        outcome,
        warnings,
        staged: stagedRows,
        unpaired: staged.unpaired,
        url: pending ? `${where}${EDITOR_HASH}` : where,
    });
};

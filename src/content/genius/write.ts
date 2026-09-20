/** The writes: `bulk_update_songs` for the bulk fields, `PUT /songs/:id` else. */
import { Result } from "@resulted/results";
import type { SelectOption } from "@/bindings";
import { describeRequestError } from "@/utilities/http";
import { cleanSoundcloudUrl } from "@/utilities/soundcloudUrl";
import { apiPut, csrfToken, type WriteFailure } from "./api";
import {
    changedFields,
    DRAFT_FIELDS,
    type DraftField,
    displayValue,
    draftFromMetadata,
    FIELD_LABELS,
    FIELD_PAYLOAD_KEYS,
    type SongDraft,
} from "./draft";
import {
    describeMetadataFailure,
    loadSongMetadata,
    type MetadataFailure,
    type SongMetadata,
} from "./metadata";
import { optionToRef } from "./options";
import { canCreate, canEdit, gateFor } from "./permissions";
import { drain } from "./pool";
import type { SongEdit } from "./saveAdapter";

/**
 * Every way a save stops, whether at one row or before the run starts.
 *
 * Flat by design: nothing here forwards the API layer's own error, and
 * each variant carries only what the row's one line has to say.
 */
export type SaveFailure =
    /** It never reached Genius. */
    | { readonly kind: "networkError" }
    /** Genius refused it, in its own words. */
    | { readonly kind: "refused"; readonly message: string }
    /** Genius answered in a shape this cannot read. */
    | { readonly kind: "unreadable" }
    /** Nothing was sent: there is no token to sign a write with. */
    | { readonly kind: "noToken"; readonly reason: string };

/** The per-row summary a failed write shows, kept short enough to fit. */
export const describeSaveFailure = (error: SaveFailure): string => {
    switch (error.kind) {
        case "networkError":
            return "The request did not get through";
        case "refused":
            return error.message;
        case "unreadable":
            return "Genius answered in a shape we could not read";
        case "noToken":
            return error.reason;
    }
};

/** Flattens a write failure into what a row actually needs. */
const asFailure = (error: WriteFailure): SaveFailure => {
    switch (error.kind) {
        case "network":
            return { kind: "networkError" };
        case "http":
            return { kind: "refused", message: describeRequestError(error) };
        case "auth":
            return { kind: "noToken", reason: error.reason };
        case "decode":
            return { kind: "unreadable" };
    }
};

/** Whole-set replace, which is what a single-song update always builds. */
interface ArrayFieldUpdate {
    readonly values: readonly EntityRef[];
}

/** Their `Lt`: an existing entity by id, one Genius has never seen by name. */
type EntityRef = { readonly id: number } | { readonly name: string };

interface ScalarFieldUpdate {
    readonly value: unknown;
    readonly replace: boolean;
}

interface BulkUpdateBody {
    readonly song_ids: readonly number[];
    readonly array_field_updates: Readonly<Record<string, ArrayFieldUpdate>>;
    readonly scalar_field_updates: Readonly<Record<string, ScalarFieldUpdate>>;
}

/** Their `w` helper folds `text_format` into every per-song write's body. */
interface SongUpdateBody {
    readonly text_format: string;
    readonly song: Readonly<Record<string, unknown>>;
}

const TEXT_FORMAT = "html,markdown,preview";

/** The five `array_field_updates` keys, in Genius's own descriptor order. */
const ARRAY_FIELDS = [
    "primaryArtists",
    "featuredArtists",
    "writerArtists",
    "producerArtists",
    "tags",
] as const;

/** The `scalar_field_updates` keys this table can edit. */
const SCALAR_FIELDS = ["releaseDate", "language", "primaryTagId"] as const;

/** Fields only `PUT /songs/:id` accepts; the bulk endpoint has none of them. */
const SONG_FIELDS = ["title", "soundcloudUrl", "youtubeUrl"] as const;

type ArrayField = (typeof ARRAY_FIELDS)[number];
type ScalarField = (typeof SCALAR_FIELDS)[number];
type SongField = (typeof SONG_FIELDS)[number];

const isArrayField = (field: DraftField): field is ArrayField =>
    (ARRAY_FIELDS as readonly DraftField[]).includes(field);

const isScalarField = (field: DraftField): field is ScalarField =>
    (SCALAR_FIELDS as readonly DraftField[]).includes(field);

const isSongField = (field: DraftField): field is SongField =>
    (SONG_FIELDS as readonly DraftField[]).includes(field);

const entityRef = (option: SelectOption): EntityRef => {
    const ref = optionToRef(option);

    return ref.id === null ? { name: ref.name } : { id: ref.id };
};

/** A single song can never disagree with itself, so `replace` is always true. */
const scalarUpdate = (
    draft: SongDraft,
    field: ScalarField,
): ScalarFieldUpdate => {
    switch (field) {
        case "releaseDate":
            return { value: draft.releaseDate, replace: true };
        case "language":
            return { value: draft.language, replace: true };
        case "primaryTagId":
            return { value: draft.primaryTagId, replace: true };
    }
};

/**
 * Never write a dirty SoundCloud URL back, whatever the user pasted.
 * Only ever reached for fields `planSong` approved, so the title is non-empty.
 * YouTube has no cleaner, so its URL is stored exactly as it was typed.
 */
const songValue = (draft: SongDraft, field: SongField): unknown => {
    switch (field) {
        case "title":
            return draft.title.trim();
        case "soundcloudUrl":
            return draft.soundcloudUrl === null
                ? null
                : cleanSoundcloudUrl(draft.soundcloudUrl);
        case "youtubeUrl":
            return draft.youtubeUrl;
    }
};

/** Why a changed field will not be sent. */
export interface SkippedField {
    readonly field: DraftField;
    readonly reason: string;
}

/**
 * Whether a staged value is one Genius must never be asked to store.
 * @returns The reason the value is invalid, or `null` when it is fine.
 */
export const validationReason = (
    draft: SongDraft,
    field: DraftField,
): string | null => {
    if (field === "title" && draft.title.trim() === "") {
        return "a song cannot have an empty title";
    }

    // Their own server answers "Must have at least one primary artist/author".
    if (field === "primaryArtists" && draft.primaryArtists.length === 0) {
        return "a song needs at least one primary artist";
    }

    return null;
};

/** Every staged value on a row that Genius would refuse to store. */
export const invalidFields = (draft: SongDraft): readonly SkippedField[] =>
    DRAFT_FIELDS.flatMap((field) => {
        const reason = validationReason(draft, field);

        return reason === null ? [] : [{ field, reason }];
    });

/** One row's approved fields; the bodies are built after the re-read. */
export interface SongWrite {
    readonly songId: number;
    readonly title: string;
    readonly fields: readonly DraftField[];
    /** The exact draft being sent, so a later edit can unpin the row's mark. */
    readonly draft: SongDraft;
    /** What the draft was diffed against, and what the re-read must still see. */
    readonly baseline: SongDraft;
    /** Resolves the baseline's primary tag id when a conflict names it. */
    readonly baselineTagName: string | null;
    /** The same for the draft's primary tag id. */
    readonly draftTagName: string | null;
}

/** Everything a confirmation needs to state, and the calls it approves. */
export interface SavePlan {
    readonly writes: readonly SongWrite[];
    /** Every sendable field touched anywhere, for the confirmation summary. */
    readonly fields: readonly DraftField[];
    readonly skipped: readonly SkippedField[];
}

/**
 * Explains a field the viewer's permissions rule out.
 * @param creating Whether the block is about adding a brand new value.
 */
const blockedBy = (field: DraftField, creating: boolean): SkippedField => ({
    field,
    reason: creating
        ? "you cannot create new tags"
        : `you lack "${gateFor(field)}" on this song`,
});

/** A credit list is only sendable if every new entry may be created. */
const mayCreateEntries = (
    metadata: SongMetadata,
    draft: SongDraft,
    field: ArrayField,
): boolean =>
    canCreate(metadata, field) ||
    !draft[field].some((option) => optionToRef(option).id === null);

/**
 * Turns one row's diff into the calls it needs, dropping what it may not send.
 * @returns The write plus every field refused, either of which may be empty.
 */
const planSong = (
    edit: SongEdit,
): { readonly write: SongWrite | null; readonly skipped: SkippedField[] } => {
    const fields: DraftField[] = [];
    const skipped: SkippedField[] = [];
    const { metadata } = edit;

    for (const field of changedFields(edit.baseline, edit.draft)) {
        const invalid = validationReason(edit.draft, field);

        if (invalid !== null) {
            skipped.push({ field, reason: invalid });
        } else if (!canEdit(metadata, field)) {
            skipped.push(blockedBy(field, false));
        } else if (isArrayField(field)) {
            if (mayCreateEntries(metadata, edit.draft, field)) {
                fields.push(field);
            } else {
                skipped.push(blockedBy(field, true));
            }
        } else {
            fields.push(field);
        }
    }

    if (fields.length === 0) {
        return { write: null, skipped };
    }

    return {
        write: {
            songId: edit.songId,
            title: edit.originalTitle,
            fields,
            draft: edit.draft,
            baseline: edit.baseline,
            baselineTagName: metadata.primaryTag?.name ?? null,
            draftTagName: edit.primaryTagName,
        },
        skipped,
    };
};

/** Splits the approved fields into the one body each endpoint wants. */
const buildBodies = (
    write: SongWrite,
    fields: readonly DraftField[],
): {
    readonly bulk: BulkUpdateBody | null;
    readonly song: SongUpdateBody | null;
} => {
    const arrayUpdates: Record<string, ArrayFieldUpdate> = {};
    const scalarUpdates: Record<string, ScalarFieldUpdate> = {};
    const songUpdates: Record<string, unknown> = {};

    for (const field of fields) {
        const key = FIELD_PAYLOAD_KEYS[field];

        if (isArrayField(field)) {
            arrayUpdates[key] = { values: write.draft[field].map(entityRef) };
        } else if (isScalarField(field)) {
            scalarUpdates[key] = scalarUpdate(write.draft, field);
        } else if (isSongField(field)) {
            songUpdates[key] = songValue(write.draft, field);
        }
    }

    const bulkCount =
        Object.keys(arrayUpdates).length + Object.keys(scalarUpdates).length;

    return {
        bulk:
            bulkCount === 0
                ? null
                : {
                      song_ids: [write.songId],
                      array_field_updates: arrayUpdates,
                      scalar_field_updates: scalarUpdates,
                  },
        song:
            Object.keys(songUpdates).length === 0
                ? null
                : { text_format: TEXT_FORMAT, song: songUpdates },
    };
};

const uniqueFields = (fields: readonly DraftField[]): readonly DraftField[] => [
    ...new Set(fields),
];

/** One entry per reason, so the summary never repeats itself per row. */
const uniqueSkipped = (
    skipped: readonly SkippedField[],
): readonly SkippedField[] => {
    const found = new Map<string, SkippedField>();

    for (const entry of skipped) {
        found.set(`${entry.field}:${entry.reason}`, entry);
    }

    return [...found.values()];
};

/**
 * Plans the calls for every changed row, carrying only what that row touched.
 * @returns The writes to send, plus what will and will not be saved.
 */
export const planSave = (edits: readonly SongEdit[]): SavePlan => {
    const writes: SongWrite[] = [];
    const fields: DraftField[] = [];
    const skipped: SkippedField[] = [];

    for (const edit of edits) {
        const planned = planSong(edit);

        skipped.push(...planned.skipped);

        if (planned.write !== null) {
            writes.push(planned.write);
            fields.push(...planned.write.fields);
        }
    }

    return {
        writes,
        fields: uniqueFields(fields),
        skipped: uniqueSkipped(skipped),
    };
};

/** One line naming the songs and fields a plan would send. */
export const describePlan = (plan: SavePlan): string => {
    const songs = plan.writes.length === 1 ? "song" : "songs";
    const names = plan.fields.map((field) => FIELD_LABELS[field]).join(", ");

    return `${plan.writes.length} ${songs}, ${names}`;
};

/**
 * Where one song's write has got to; `queued` means accepted, not applied.
 * `canceled` is Genius dropping the task, which stores nothing either.
 */
export type SaveStage =
    | "checking"
    | "saving"
    | "saved"
    | "queued"
    | "canceled"
    | "conflict"
    | "failed";

/** A queued bulk task, and everything needed to hear how it ended. */
export interface BulkTask {
    readonly taskId: string;
    /** Its Pusher channel, or `null` when the response named none. */
    readonly channel: string | null;
    /** The songs it carried, so another task's event cannot land here. */
    readonly songIds: readonly number[];
    /** The fields it sent, which only a confirmation may call written. */
    readonly fields: readonly DraftField[];
}

/** One field someone else changed while the table sat open. */
export interface FieldConflict {
    readonly field: DraftField;
    /** The value the draft was built from. */
    readonly loaded: string;
    /** What the re-read found on Genius instead. */
    readonly current: string;
    /** The user's own staged value, kept so a row reload cannot lose it. */
    readonly mine: string;
}

/** One song's write, as the table should currently show it. */
export interface SaveProgress {
    readonly songId: number;
    readonly stage: SaveStage;
    readonly message: string;
    readonly draft: SongDraft;
    /** Fields held back because Genius moved under us, never written. */
    readonly conflicts: readonly FieldConflict[];
    /** Fields an endpoint stored, which the row's baseline may advance to. */
    readonly written: readonly DraftField[];
    /** The bulk task still to be heard from, whose fields are not written. */
    readonly task: BulkTask | null;
}

/** Receives every stage change, on the caller's thread, as it happens. */
export type SaveSink = (progress: SaveProgress) => void;

/** The tally a finished run reports. */
export interface SaveOutcome {
    /** Rows Genius stored outright, meaning nothing about them is pending. */
    readonly saved: number;
    readonly queued: number;
    readonly failed: number;
    /** Rows that had at least one field held back, which may also have sent. */
    readonly conflicted: number;
}

/** Three at a time: quick enough to feel live, gentle on a shared API. */
const CONCURRENCY = 3;

const channelOf = (
    task: Readonly<Record<string, unknown>>,
    response: Record<string, unknown>,
): string | null => {
    for (const value of [task.pusher_channel, response.pusher_channel]) {
        if (typeof value === "string" && value !== "") {
            return value;
        }
    }

    return null;
};

/** The accepted task: its id, and the channel its verdict arrives on. */
const queuedTask = (
    response: Record<string, unknown>,
): { readonly id: string; readonly channel: string | null } | null => {
    const task = response.bulk_song_update_task;

    if (typeof task !== "object" || task === null) {
        return null;
    }

    const fields = task as Readonly<Record<string, unknown>>;
    const id = fields.task_id;

    if (typeof id !== "number" && typeof id !== "string") {
        return null;
    }

    return { channel: channelOf(fields, response), id: String(id) };
};

/**
 * Genius answers with a task id and applies the edit over Pusher, later.
 * Its nine descriptor keys are the server's whole permitted set, not just what
 * their UI exposes: `soundcloud_url` here answers 422 "Unknown scalar field",
 * so the media fields have to go through `PUT /songs/:id`.
 * @returns The queued task, or `null` when the 2xx carried none.
 */
const putBulk = async (
    albumId: number,
    body: BulkUpdateBody,
    fields: readonly DraftField[],
): Promise<Result<BulkTask | null, SaveFailure>> => {
    const response = await apiPut(`/albums/${albumId}/bulk_update_songs`, body);

    if (response.isErr()) {
        return Result.err(asFailure(response.error));
    }

    const task = queuedTask(response.value);

    return Result.ok(
        task === null
            ? null
            : {
                  channel: task.channel,
                  fields,
                  songIds: body.song_ids,
                  taskId: task.id,
              },
    );
};

/** This one is synchronous: a 2xx carrying the song means it is stored. */
const putSong = async (
    songId: number,
    body: SongUpdateBody,
): Promise<Result<boolean, SaveFailure>> => {
    const response = await apiPut(`/songs/${songId}`, body);

    if (response.isErr()) {
        return Result.err(asFailure(response.error));
    }

    const { song } = response.value;

    return Result.ok(typeof song === "object" && song !== null);
};

/**
 * Re-reads the song and names every field that moved under the draft.
 * @returns The conflicts, or the error that made the check inconclusive.
 */
const findConflicts = async (
    write: SongWrite,
): Promise<Result<readonly FieldConflict[], MetadataFailure>> => {
    const fresh = await loadSongMetadata(write.songId);

    if (fresh.isErr()) {
        return fresh;
    }

    const current = draftFromMetadata(fresh.value);
    const moved = changedFields(write.baseline, current);
    const currentTagName = fresh.value.primaryTag?.name ?? null;

    return Result.ok(
        write.fields
            .filter((field) => moved.includes(field))
            .map((field) => ({
                field,
                loaded: displayValue(
                    write.baseline,
                    field,
                    write.baselineTagName,
                ),
                current: displayValue(current, field, currentTagName),
                mine: displayValue(write.draft, field, write.draftTagName),
            })),
    );
};

/**
 * Fields a stashed baseline disagrees with a freshly read one on.
 * Only fields the user touched can conflict: anything else is simply Genius's
 * current value, and a restore never writes it back.
 * @param tagName Resolves a draft's primary tag id, which a conflict names.
 */
export const restoreConflicts = (
    stashed: SongDraft,
    fresh: SongDraft,
    draft: SongDraft,
    fields: readonly DraftField[],
    tagName: (draft: SongDraft) => string | null,
): readonly FieldConflict[] => {
    const moved = changedFields(stashed, fresh);

    return fields
        .filter((field) => moved.includes(field))
        .map((field) => ({
            field,
            loaded: displayValue(stashed, field, tagName(stashed)),
            current: displayValue(fresh, field, tagName(fresh)),
            mine: displayValue(draft, field, tagName(draft)),
        }));
};

/** What one row's two calls settled on, once both have run. */
interface RowResult {
    readonly stage: SaveStage;
    readonly message: string;
    readonly conflicts: readonly FieldConflict[];
    /** Fields Genius has stored; empty whenever nothing went through. */
    readonly written: readonly DraftField[];
    /** The task whose fields are only accepted, never yet stored. */
    readonly task: BulkTask | null;
}

const fieldNames = (fields: readonly DraftField[]): string =>
    fields.map((field) => FIELD_LABELS[field]).join(", ");

const conflictNames = (conflicts: readonly FieldConflict[]): string =>
    fieldNames(conflicts.map((entry) => entry.field));

/**
 * Re-reads, drops whatever moved, then sends the rest through both endpoints.
 * @returns The row's outcome, or the error one of the two calls answered with.
 */
const sendRow = async (
    albumId: number,
    write: SongWrite,
): Promise<Result<RowResult, SaveFailure>> => {
    const found = await findConflicts(write);

    // Unverified is not the same as unchanged, so nothing goes out.
    if (found.isErr()) {
        return Result.ok({
            stage: "failed",
            message: `Not sent, could not re-read the song first: ${describeMetadataFailure(
                found.error,
            )}`,
            conflicts: [],
            written: [],
            task: null,
        });
    }

    const conflicts = found.value;
    const held = new Set(conflicts.map((entry) => entry.field));
    const sendable = write.fields.filter((field) => !held.has(field));

    if (sendable.length === 0) {
        return Result.ok({
            stage: "conflict",
            message: `Not sent, changed on Genius: ${conflictNames(conflicts)}`,
            conflicts,
            written: [],
            task: null,
        });
    }

    const { bulk, song } = buildBodies(write, sendable);
    const bulkFields = sendable.filter((field) => !isSongField(field));
    const songFields = sendable.filter(isSongField);
    const failures: SaveFailure[] = [];

    /** `null` while the endpoint has not answered, or was never called. */
    let bulkQueued: boolean | null = null;
    let songSaved: boolean | null = null;
    let task: BulkTask | null = null;

    if (bulk !== null) {
        const sent = await putBulk(albumId, bulk, bulkFields);

        if (sent.isErr()) {
            failures.push(sent.error);
        } else {
            bulkQueued = sent.value !== null;
            task = sent.value;
        }
    }

    if (song !== null) {
        const sent = await putSong(write.songId, song);

        if (sent.isErr()) {
            failures.push(sent.error);
        } else {
            songSaved = sent.value;
        }
    }

    // Only this endpoint's 2xx means stored; the bulk task is still pending.
    const written = songSaved === true ? songFields : [];
    const queued = task === null ? [] : bulkFields;
    const through = [...written, ...queued];
    // A 2xx that queued no task, or answered with no song, applied nothing.
    const stalled = [
        ...(bulkQueued === false ? bulkFields : []),
        ...(songSaved === false ? songFields : []),
    ];
    /** Only one endpoint can be the one that went through here. */
    const partly = queued.length > 0 ? "Queued" : "Saved";
    const first = failures[0];

    if (first !== undefined) {
        // One endpoint going through is news the row still has to carry,
        // whichever of the two it was.
        return through.length === 0
            ? Result.err(first)
            : Result.ok({
                  stage: "failed",
                  message: `${partly} ${fieldNames(
                      through,
                  )}, but the rest failed: ${describeSaveFailure(first)}`,
                  conflicts,
                  written,
                  task,
              });
    }

    if (stalled.length > 0) {
        return Result.ok({
            stage: "failed",
            message:
                through.length === 0
                    ? "Genius accepted the request but stored no update"
                    : `${partly} ${fieldNames(through)}, but Genius stored ` +
                      `no update for ${fieldNames(stalled)}`,
            conflicts,
            written,
            task,
        });
    }

    // Queued beats saved: a row is only saved when nothing about it is pending.
    const settled =
        task === null && songSaved === true
            ? { stage: "saved" as const, message: "Saved" }
            : { stage: "queued" as const, message: "Queued" };

    return Result.ok(
        conflicts.length === 0
            ? { ...settled, conflicts, written, task }
            : {
                  ...settled,
                  message: `${settled.message}, except ${conflictNames(
                      conflicts,
                  )}`,
                  conflicts,
                  written,
                  task,
              },
    );
};

/**
 * Sends every planned write, reporting each song as it settles.
 * @param sink Called with `checking` before each row and its result after.
 * @returns The tally, or the `auth` error that stopped the run before it sent.
 */
export const runSave = async (
    albumId: number,
    plan: SavePlan,
    sink: SaveSink,
): Promise<Result<SaveOutcome, SaveFailure>> => {
    const token = csrfToken();

    if (token.isErr()) {
        return Result.err(asFailure(token.error));
    }

    let saved = 0;
    let queued = 0;
    let failed = 0;
    let conflicted = 0;

    await drain(plan.writes, CONCURRENCY, async (write) => {
        sink({
            songId: write.songId,
            stage: "checking",
            message: "Re-reading…",
            draft: write.draft,
            conflicts: [],
            written: [],
            task: null,
        });

        const result = await sendRow(albumId, write);

        if (result.isErr()) {
            failed += 1;
            sink({
                songId: write.songId,
                stage: "failed",
                message: describeSaveFailure(result.error),
                draft: write.draft,
                conflicts: [],
                written: [],
                task: null,
            });
            return;
        }

        const settled = result.value;

        if (settled.conflicts.length > 0) {
            conflicted += 1;
        }

        if (settled.stage === "saved") {
            saved += 1;
        } else if (settled.stage === "queued") {
            queued += 1;
        } else if (settled.stage === "failed") {
            failed += 1;
        }

        sink({ songId: write.songId, draft: write.draft, ...settled });
    });

    return Result.ok({ saved, queued, failed, conflicted });
};

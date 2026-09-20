/** The clipboard exports, kept beside the real write as secondary actions. */
import { Result } from "@resulted/results";
import {
    changedFields,
    DRAFT_FIELDS,
    displayValue,
    FIELD_LABELS,
    FIELD_PAYLOAD_KEYS,
    payloadValue,
    type SongDraft,
} from "./draft";
import type { SongMetadata } from "./metadata";

/** Nothing to export, or a clipboard the browser would not write to. */
export interface ExportError {
    readonly kind: "unsupported";
    readonly reason: string;
}

export interface SongEdit {
    readonly songId: number;
    /** The title as fetched, so a renamed row is still identifiable. */
    readonly originalTitle: string;
    /** The record behind the row, which carries the viewer's permissions. */
    readonly metadata: SongMetadata;
    readonly url: string | null;
    readonly trackNumber: number | null;
    readonly baseline: SongDraft;
    readonly draft: SongDraft;
    /** Resolved name of `draft.primaryTagId`, which is only an id. */
    readonly primaryTagName: string | null;
}

export interface SaveAdapter {
    readonly id: string;
    readonly label: string;
    /** Resolves to the line shown to the user on success. */
    readonly run: (
        edits: readonly SongEdit[],
    ) => Promise<Result<string, ExportError>>;
}

const copy = async (text: string): Promise<Result<null, ExportError>> => {
    const written = await Result.try(navigator.clipboard.writeText(text));

    return written.isErr()
        ? Result.err({
              kind: "unsupported",
              reason: `The browser refused the clipboard write: ${String(
                  written.error,
              )}`,
          })
        : Result.ok(null);
};

const nothingToDo = (): Result<string, ExportError> =>
    Result.err({ kind: "unsupported", reason: "No rows have been edited yet" });

/** Per song: the changed fields, under the API's key names, from and to. */
const toJson = (edits: readonly SongEdit[]): string => {
    const songs = edits.map((edit) => {
        const changes: Record<string, unknown> = {};

        for (const field of changedFields(edit.baseline, edit.draft)) {
            changes[FIELD_PAYLOAD_KEYS[field]] = {
                from: payloadValue(edit.baseline, field),
                to: payloadValue(edit.draft, field),
            };
        }

        return {
            song_id: edit.songId,
            title: edit.originalTitle,
            url: edit.url,
            track_number: edit.trackNumber,
            changes,
        };
    });

    return `${JSON.stringify({ songs }, null, 2)}\n`;
};

const TSV_CELL = /[\t\r\n]+/g;

const cell = (value: string): string => value.replace(TSV_CELL, " ").trim();

const toTsv = (edits: readonly SongEdit[]): string => {
    const header = [
        "track",
        "song_id",
        "url",
        ...DRAFT_FIELDS.map((field) => FIELD_LABELS[field]),
        "changed",
    ];

    const lines = edits.map((edit) => {
        const changed = changedFields(edit.baseline, edit.draft);

        return [
            edit.trackNumber === null ? "" : String(edit.trackNumber),
            String(edit.songId),
            edit.url ?? "",
            ...DRAFT_FIELDS.map((field) =>
                cell(displayValue(edit.draft, field, edit.primaryTagName)),
            ),
            changed.map((field) => FIELD_LABELS[field]).join(", "),
        ].join("\t");
    });

    return `${[header.join("\t"), ...lines].join("\n")}\n`;
};

const plural = (count: number): string => (count === 1 ? "row" : "rows");

export const SAVE_ADAPTERS: readonly SaveAdapter[] = [
    {
        id: "clipboard-json",
        label: "Copy JSON",
        run: async (edits) => {
            if (edits.length === 0) {
                return nothingToDo();
            }

            const written = await copy(toJson(edits));

            return written.isErr()
                ? written
                : Result.ok(
                      `Copied ${edits.length} edited ${plural(edits.length)} as JSON`,
                  );
        },
    },
    {
        id: "clipboard-tsv",
        label: "Copy TSV",
        run: async (edits) => {
            if (edits.length === 0) {
                return nothingToDo();
            }

            const written = await copy(toTsv(edits));

            return written.isErr()
                ? written
                : Result.ok(
                      `Copied ${edits.length} edited ${plural(edits.length)} as TSV`,
                  );
        },
    },
];

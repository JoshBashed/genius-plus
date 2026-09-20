/** Turns matched tracks into the patches the table stages for them. */
import type { SelectOption } from "@/bindings";
import type { AppleSongCredits } from "@/utilities/appleCredits";
import type { DraftField, SongDraft } from "../draft";
import { isEmptyField } from "../draft";
import type { SongMetadata } from "../metadata";
import { optionLabel, uniqueOptions } from "../options";
import { canEdit } from "../permissions";
import {
    type ContributorPlan,
    creditOptions,
    nameKey,
    namesOptions,
} from "./contributors";
import type { AlbumCredits } from "./credits";
import type { TrackMatch } from "./matchTracks";

/**
 * The fields Apple carries a value for.
 *
 * No `title`: a song is named once, when it is created, and the reader
 * names it there. Nothing this import does renames an existing song.
 * Writers and producers are only on their per song credits page, so
 * those two are filled only when an import went and read it.
 */
export type ImportField = Extract<
    DraftField,
    | "primaryArtists"
    | "featuredArtists"
    | "writerArtists"
    | "producerArtists"
    | "releaseDate"
    | "language"
    | "primaryTagId"
>;

export const IMPORT_FIELDS: readonly ImportField[] = [
    "primaryArtists",
    "featuredArtists",
    "writerArtists",
    "producerArtists",
    "releaseDate",
    "language",
    "primaryTagId",
];

/**
 * Apple's genre names against Genius's seven primary tags.
 * Resolved by name at use, so no tag id is ever written down here.
 */
const GENRE_TAGS: Readonly<Record<string, string>> = {
    alternative: "Rock",
    audiobooks: "Non-Music",
    comedy: "Non-Music",
    country: "Country",
    dance: "Electronic",
    electronic: "Electronic",
    "hard rock": "Rock",
    "hip-hop/rap": "Rap",
    "hip hop/rap": "Rap",
    house: "Electronic",
    metal: "Rock",
    pop: "Pop",
    punk: "Rock",
    "r&b/soul": "R&B",
    rap: "Rap",
    rock: "Rock",
    "singer/songwriter": "Pop",
    soul: "R&B",
    "spoken word": "Non-Music",
    techno: "Electronic",
};

/**
 * Resolves Apple's genre to one of Genius's own primary tags.
 * @returns `null` when Apple named a genre Genius has no primary tag for.
 */
export const genreTagId = (
    genre: string | null,
    options: readonly SelectOption[],
): number | null => {
    const wanted = GENRE_TAGS[nameKey(genre ?? "")];

    if (wanted === undefined) {
        return null;
    }

    const option = options.find(
        (entry) => nameKey(optionLabel(entry.label)) === nameKey(wanted),
    );

    return typeof option?.value === "number" ? option.value : null;
};

/** One field's imported value, spelled out so a key cannot widen the type. */
const fieldPatchFor = (
    field: ImportField,
    match: TrackMatch,
    plan: ContributorPlan,
    tagId: number | null,
    credits: AppleSongCredits | undefined,
    language: string | null,
): Partial<SongDraft> => {
    const track = match.imported;

    switch (field) {
        case "primaryArtists":
            return { primaryArtists: creditOptions(plan, track.primaryCredit) };
        case "featuredArtists":
            return {
                featuredArtists: uniqueOptions(
                    track.featuredCredits.flatMap((credit) =>
                        creditOptions(plan, credit),
                    ),
                ),
            };
        case "writerArtists":
            return {
                writerArtists: namesOptions(plan, credits?.writers ?? []),
            };
        case "producerArtists":
            return {
                producerArtists: namesOptions(plan, credits?.producers ?? []),
            };
        case "releaseDate":
            return { releaseDate: track.releaseDate };
        // The reader's, not Apple's: Apple says nothing about language.
        case "language":
            return { language };
        case "primaryTagId":
            return { primaryTagId: tagId };
    }
};

/** Whether an imported field carries anything worth staging. */
const carries = (patch: Partial<SongDraft>, field: ImportField): boolean => {
    const value = patch[field];

    switch (field) {
        case "primaryArtists":
        case "featuredArtists":
        case "writerArtists":
        case "producerArtists":
            return Array.isArray(value) && value.length > 0;
        case "releaseDate":
            return (
                typeof value === "object" &&
                value !== null &&
                "year" in value &&
                value.year !== null
            );
        case "language":
            return typeof value === "string" && value !== "";
        case "primaryTagId":
            return typeof value === "number";
    }
};

/** A loaded row, which is the only kind the import can stage onto. */
export interface StageRow {
    readonly songId: number;
    readonly draft: SongDraft;
    readonly metadata: SongMetadata;
}

export interface StageOptions {
    readonly fields: readonly ImportField[];
    /** `empty` only fills a field holding nothing; `all` overwrites it. */
    readonly mode: "empty" | "all";
    /**
     * Songs this import just created, which are always overwritten.
     * Genius gives a new song the title it was created with and the
     * album's own artists, so under `empty` the import would skip the
     * two fields it most needs to correct, and a compilation would end
     * up crediting every track to the album artist.
     */
    readonly fresh?: ReadonlySet<number>;
    /** Per track writers and producers, when an import read them. */
    readonly credits?: AlbumCredits;
    /** Genius's own code, as the reader chose it; Apple gives none. */
    readonly language?: string | null;
}

export interface StagedPatch {
    readonly songId: number;
    readonly patch: Partial<SongDraft>;
}

export interface StagePlan {
    readonly patches: readonly StagedPatch[];
    /** Fields left alone because this viewer may not edit them. */
    readonly blocked: readonly ImportField[];
    /** Imported tracks that paired with no row on this album. */
    readonly unpaired: number;
}

/**
 * Plans every patch an import would stage, and writes nothing.
 * @param rows The loaded rows, by song id; a row still loading is skipped.
 */
export const stageImport = (
    matches: readonly TrackMatch[],
    plan: ContributorPlan,
    rows: ReadonlyMap<number, StageRow>,
    tagId: number | null,
    options: StageOptions,
): StagePlan => {
    const patches: StagedPatch[] = [];
    const blocked = new Set<ImportField>();
    let unpaired = 0;

    for (const match of matches) {
        const row = match.songId === null ? undefined : rows.get(match.songId);

        if (match.songId === null || row === undefined) {
            unpaired += 1;
            continue;
        }

        const staged: { -readonly [Key in ImportField]?: SongDraft[Key] } = {};

        for (const field of options.fields) {
            const one = fieldPatchFor(
                field,
                match,
                plan,
                tagId,
                options.credits?.get(match.imported.key),
                options.language ?? null,
            );

            if (!carries(one, field)) {
                continue;
            }

            if (!canEdit(row.metadata, field)) {
                blocked.add(field);
                continue;
            }

            const overwrite =
                options.mode === "all" ||
                options.fresh?.has(row.songId) === true;

            if (!overwrite && !isEmptyField(row.draft, field)) {
                continue;
            }

            Object.assign(staged, one);
        }

        if (Object.keys(staged).length > 0) {
            patches.push({ patch: staged, songId: row.songId });
        }
    }

    return { blocked: [...blocked], patches, unpaired };
};

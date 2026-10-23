/** Staged edits. A draft against its baseline is what makes a row dirty. */
import type { DateComponents, SelectOption } from "@/bindings";
import {
    EMPTY_DATE,
    type NamedRef,
    type SongMetadata,
} from "@/content/genius/metadata";
import {
    artistToOption,
    optionLabel,
    optionToRef,
    refToOption,
} from "@/content/genius/options";

export interface SongDraft {
    readonly title: string;
    readonly primaryArtists: readonly SelectOption[];
    readonly featuredArtists: readonly SelectOption[];
    readonly writerArtists: readonly SelectOption[];
    readonly producerArtists: readonly SelectOption[];
    readonly releaseDate: DateComponents;
    readonly language: string | null;
    readonly primaryTagId: number | null;
    readonly tags: readonly SelectOption[];
    readonly soundcloudUrl: string | null;
    readonly youtubeUrl: string | null;
}

export type DraftField = keyof SongDraft;

/** Column order, and therefore export column order. */
export const DRAFT_FIELDS: readonly DraftField[] = [
    "title",
    "primaryArtists",
    "featuredArtists",
    "writerArtists",
    "producerArtists",
    "releaseDate",
    "language",
    "primaryTagId",
    "tags",
    "soundcloudUrl",
    "youtubeUrl",
];

export const FIELD_LABELS: Readonly<Record<DraftField, string>> = {
    title: "Song",
    primaryArtists: "Primary artists",
    featuredArtists: "Featured artists",
    writerArtists: "Writers",
    producerArtists: "Producers",
    releaseDate: "Release date",
    language: "Language",
    primaryTagId: "Primary tag",
    tags: "Tags",
    soundcloudUrl: "SoundCloud URL",
    youtubeUrl: "YouTube URL",
};

/** The API's own names for the same fields, for the JSON export. */
export const FIELD_PAYLOAD_KEYS: Readonly<Record<DraftField, string>> = {
    title: "title",
    primaryArtists: "primary_artists",
    featuredArtists: "featured_artists",
    writerArtists: "writer_artists",
    producerArtists: "producer_artists",
    releaseDate: "release_date_components",
    language: "language",
    primaryTagId: "primary_tag_id",
    tags: "tags",
    soundcloudUrl: "soundcloud_url",
    youtubeUrl: "youtube_url",
};

export const draftFromMetadata = (metadata: SongMetadata): SongDraft => ({
    title: metadata.title,
    primaryArtists: metadata.primaryArtists.map(artistToOption),
    featuredArtists: metadata.featuredArtists.map(artistToOption),
    writerArtists: metadata.writerArtists.map(artistToOption),
    producerArtists: metadata.producerArtists.map(artistToOption),
    releaseDate: metadata.releaseDate,
    language: metadata.language,
    primaryTagId: metadata.primaryTag?.id ?? null,
    tags: metadata.tags.map(refToOption),
    soundcloudUrl: metadata.soundcloudUrl,
    youtubeUrl: metadata.youtubeUrl,
});

const refsOf = (options: readonly SelectOption[]): readonly NamedRef[] =>
    options.map(optionToRef);

/** Comparison key. Credit order is meaningful, so it is not sorted. */
const keyOf = (draft: SongDraft, field: DraftField): string => {
    switch (field) {
        case "title":
            return draft.title.trim();
        case "language":
            return draft.language ?? "";
        case "soundcloudUrl":
            return draft.soundcloudUrl ?? "";
        case "youtubeUrl":
            return draft.youtubeUrl ?? "";
        case "primaryTagId":
            return draft.primaryTagId === null
                ? ""
                : String(draft.primaryTagId);
        case "releaseDate": {
            const { year, month, day } = draft.releaseDate;
            return `${year ?? ""}-${month ?? ""}-${day ?? ""}`;
        }
        default:
            return refsOf(draft[field])
                .map((ref) => (ref.id === null ? `new:${ref.name}` : ref.id))
                .join("\u0000");
    }
};

export const changedFields = (
    baseline: SongDraft,
    draft: SongDraft,
): readonly DraftField[] =>
    DRAFT_FIELDS.filter(
        (field) => keyOf(baseline, field) !== keyOf(draft, field),
    );

/** Human-readable value of one field, for the TSV export. */
export const displayValue = (
    draft: SongDraft,
    field: DraftField,
    primaryTagName: string | null,
): string => {
    switch (field) {
        case "title":
            return draft.title;
        case "language":
            return draft.language ?? "";
        case "soundcloudUrl":
            return draft.soundcloudUrl ?? "";
        case "youtubeUrl":
            return draft.youtubeUrl ?? "";
        case "primaryTagId":
            return primaryTagName ?? "";
        case "releaseDate": {
            const { year, month, day } = draft.releaseDate;

            if (year === null && month === null && day === null) {
                return "";
            }

            const pad = (part: number | null): string =>
                part === null ? "??" : String(part).padStart(2, "0");

            return `${year ?? "????"}-${pad(month)}-${pad(day)}`;
        }
        default:
            return draft[field]
                .map((option) => optionLabel(option.label))
                .join(", ");
    }
};

/** One field under its API key's own value shape, for the JSON export. */
export const payloadValue = (draft: SongDraft, field: DraftField): unknown => {
    switch (field) {
        case "title":
            return draft.title;
        case "language":
            return draft.language;
        case "soundcloudUrl":
            return draft.soundcloudUrl;
        case "youtubeUrl":
            return draft.youtubeUrl;
        case "primaryTagId":
            return draft.primaryTagId;
        case "releaseDate":
            return draft.releaseDate;
        default:
            return refsOf(draft[field]).map((ref) =>
                ref.id === null ? { name: ref.name } : { id: ref.id },
            );
    }
};

export const EMPTY_DRAFT: SongDraft = {
    title: "",
    primaryArtists: [],
    featuredArtists: [],
    writerArtists: [],
    producerArtists: [],
    releaseDate: EMPTY_DATE,
    language: null,
    primaryTagId: null,
    tags: [],
    soundcloudUrl: null,
    youtubeUrl: null,
};

/** Whether one field of a draft holds nothing a save would ever send. */
export const isEmptyField = (draft: SongDraft, field: DraftField): boolean => {
    switch (field) {
        case "title":
            return draft.title.trim() === "";
        case "language":
            return draft.language === null;
        case "soundcloudUrl":
            return draft.soundcloudUrl === null;
        case "youtubeUrl":
            return draft.youtubeUrl === null;
        case "primaryTagId":
            return draft.primaryTagId === null;
        case "releaseDate": {
            const { year, month, day } = draft.releaseDate;

            return year === null && month === null && day === null;
        }
        default:
            return draft[field].length === 0;
    }
};

/**
 * Lifts one field out of a draft as a patch another draft can take.
 * @returns A one key object, so a computed key never widens the type.
 */
export const fieldPatch = (
    draft: SongDraft,
    field: DraftField,
): Partial<SongDraft> => {
    switch (field) {
        case "title":
            return { title: draft.title };
        case "primaryArtists":
            return { primaryArtists: draft.primaryArtists };
        case "featuredArtists":
            return { featuredArtists: draft.featuredArtists };
        case "writerArtists":
            return { writerArtists: draft.writerArtists };
        case "producerArtists":
            return { producerArtists: draft.producerArtists };
        case "releaseDate":
            return { releaseDate: draft.releaseDate };
        case "language":
            return { language: draft.language };
        case "primaryTagId":
            return { primaryTagId: draft.primaryTagId };
        case "tags":
            return { tags: draft.tags };
        case "soundcloudUrl":
            return { soundcloudUrl: draft.soundcloudUrl };
        case "youtubeUrl":
            return { youtubeUrl: draft.youtubeUrl };
    }
};

/** The fields a patch carries, in column order. */
export const patchFields = (patch: Partial<SongDraft>): readonly DraftField[] =>
    DRAFT_FIELDS.filter((field) => patch[field] !== undefined);

/** Lifts several fields out of a draft as one patch another can take. */
export const fieldsPatch = (
    draft: SongDraft,
    fields: readonly DraftField[],
): Partial<SongDraft> => {
    const patch: { -readonly [Key in DraftField]?: SongDraft[Key] } = {};

    for (const field of fields) {
        Object.assign(patch, fieldPatch(draft, field));
    }

    return patch;
};

/** The same patch without the named fields, which something else now owns. */
export const withoutFields = (
    patch: Partial<SongDraft>,
    fields: readonly DraftField[],
): Partial<SongDraft> => {
    const kept: { -readonly [Key in DraftField]?: SongDraft[Key] } = {
        ...patch,
    };

    for (const field of fields) {
        delete kept[field];
    }

    return kept;
};

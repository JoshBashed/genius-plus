/** One column's editor, shared by the table's cells and the fill dialog. */
import type { PageElement, SelectOption } from "@/bindings";
import { FIELD_LABELS, type SongDraft } from "../draft";
import { SelectInput, TagInput, TextInput } from "../geniusComponents";
import { loadArtistOptions, loadTagOptions, optionFor } from "../options";
import { MENU_STYLES, PORTAL_PROPS } from "../selectProps";
import { type ColumnSpec, isSortable, type TagColumn } from "./columns";
import { DateCell } from "./styles";

export interface ColumnEditorProps {
    readonly column: ColumnSpec;
    readonly draft: SongDraft;
    readonly disabled: boolean;
    readonly hasError: boolean;
    /** Already widened with the stored value, when the row had one. */
    readonly languageOptions: readonly SelectOption[];
    readonly primaryTagOptions: readonly SelectOption[];
    readonly onPatch: (next: Partial<SongDraft>) => void;
}

/** Spelled out: a computed key widens `Partial<SongDraft>`. */
const chipsPatch = (
    field: TagColumn["field"],
    next: readonly SelectOption[],
): Partial<SongDraft> => {
    switch (field) {
        case "primaryArtists":
            return { primaryArtists: next };
        case "featuredArtists":
            return { featuredArtists: next };
        case "writerArtists":
            return { writerArtists: next };
        case "producerArtists":
            return { producerArtists: next };
        case "tags":
            return { tags: next };
    }
};

const textValue = (
    draft: SongDraft,
    field: Extract<ColumnSpec, { kind: "text" }>["field"],
): string => {
    switch (field) {
        case "title":
            return draft.title;
        case "soundcloudUrl":
            return draft.soundcloudUrl ?? "";
        case "youtubeUrl":
            return draft.youtubeUrl ?? "";
    }
};

/** A blank link is stored as `null`; a blank title is caught by validation. */
const textPatch = (
    field: Extract<ColumnSpec, { kind: "text" }>["field"],
    value: string,
): Partial<SongDraft> => {
    switch (field) {
        case "title":
            return { title: value };
        case "soundcloudUrl":
            return { soundcloudUrl: value === "" ? null : value };
        case "youtubeUrl":
            return { youtubeUrl: value === "" ? null : value };
    }
};

export const ColumnEditor = (props: ColumnEditorProps): PageElement => {
    const { column, disabled, draft, hasError, onPatch } = props;

    switch (column.kind) {
        case "text":
            return (
                <TextInput
                    disabled={disabled}
                    fullWidth
                    hasError={hasError}
                    onChange={(event) => {
                        const input = event.currentTarget;

                        if (input instanceof HTMLInputElement) {
                            onPatch(textPatch(column.field, input.value));
                        }
                    }}
                    paddingKey="quarter"
                    placeholder={FIELD_LABELS[column.field]}
                    value={textValue(draft, column.field)}
                />
            );
        case "artists":
        case "tags":
            return (
                <TagInput
                    controlledValue={draft[column.field]}
                    customStyles={MENU_STYLES}
                    disabled={disabled}
                    isSortable={isSortable(column)}
                    loadOptions={
                        column.kind === "artists"
                            ? loadArtistOptions
                            : loadTagOptions
                    }
                    onChange={(next) => {
                        onPatch(chipsPatch(column.field, next));
                    }}
                    placeholder={FIELD_LABELS[column.field]}
                    promptMessage={`Search ${FIELD_LABELS[
                        column.field
                    ].toLowerCase()}`}
                    reactSelectProps={PORTAL_PROPS}
                    valueBackgroundKey="variant"
                />
            );
        case "date":
            // No portal: DateInput hardcodes its own selectProps, so these
            // three menus cannot escape the scroller.
            return (
                <DateCell
                    customStyles={MENU_STYLES}
                    day={draft.releaseDate.day}
                    disabled={disabled}
                    month={draft.releaseDate.month}
                    onChange={(releaseDate) => {
                        onPatch({ releaseDate });
                    }}
                    year={draft.releaseDate.year}
                />
            );
        case "select": {
            const language = column.field === "language";
            const options = language
                ? props.languageOptions
                : props.primaryTagOptions;

            return (
                <SelectInput
                    controlledValue={optionFor(
                        options,
                        language ? draft.language : draft.primaryTagId,
                    )}
                    customStyles={MENU_STYLES}
                    disabled={disabled}
                    isClearable
                    onChange={(option) => {
                        if (language) {
                            onPatch({
                                language:
                                    option === null
                                        ? null
                                        : String(option.value),
                            });
                            return;
                        }

                        onPatch({
                            primaryTagId:
                                option === null ||
                                typeof option.value !== "number"
                                    ? null
                                    : option.value,
                        });
                    }}
                    options={options}
                    placeholder={FIELD_LABELS[column.field]}
                    selectProps={PORTAL_PROPS}
                />
            );
        }
    }
};

/** Keeps a stored value selectable when the option list lacks it. */
export const withCurrent = (
    options: readonly SelectOption[],
    value: string | number | null,
    label: string | null,
): readonly SelectOption[] => {
    if (value === null || label === null) {
        return options;
    }

    return options.some((option) => option.value === value)
        ? options
        : [...options, { value, label }];
};

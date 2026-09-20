/** Genius's own "search or create a song" control, rebuilt. */
import type { PageElement, SelectOption } from "@/bindings";
// Deep imports, not the barrel: it evaluates every component, and this
// page binds only the few it renders with.
import { TagInput } from "../geniusComponents/TagInput";
import { loadSongOptions } from "../options";
import { MENU_STYLES, PORTAL_PROPS } from "../selectProps";

/**
 * Their own props, read off `SearchOrCreateSongInput` in
 * `reactAlbumClient`. That chunk exports nothing at all, so the
 * component itself cannot be bound; it is a thin wrapper over the same
 * `TagInput` we already borrow, and this is its configuration.
 */
const SELECT_PROPS: Readonly<Record<string, unknown>> = {
    ...PORTAL_PROPS,
    createOptionPosition: "first",
    tabSelectsValue: true,
};

/** What a pick means: an existing song, or a name to create one under. */
export type SongChoice =
    | { readonly kind: "song"; readonly songId: number; readonly title: string }
    | { readonly kind: "new"; readonly title: string };

interface SongSelectProps {
    /** The current pick, so the field can be driven from outside. */
    readonly value: SongChoice | null;
    readonly placeholder?: string;
    readonly label: string;
    /** Shown before a search, so the menu opens with something in it. */
    readonly suggestions?: readonly SelectOption[];
    readonly onSelect: (choice: SongChoice | null) => void;
    /**
     * Text to open the box with, so a name arrives ready to correct and
     * `Create "…"` is there without typing it.
     *
     * Read once, at mount: react-select owns the box after that. Driving
     * it instead froze the field, because their `TagInput` passes an
     * `onInputChange` of its own and ours never ran.
     */
    readonly initialText?: string;
    /**
     * Show the pick as editable text rather than as a tag.
     *
     * For a name this page proposed rather than one the reader chose: a
     * tag reads as settled, and the point of the proposal is that it is
     * theirs to correct. Their own pick becomes a tag, so choosing one
     * is visibly different from being handed one.
     */
    readonly asText?: boolean;
}

const optionFor = (choice: SongChoice | null): readonly SelectOption[] => {
    if (choice === null) {
        return [];
    }

    return choice.kind === "song"
        ? [{ value: choice.songId, label: { primary: choice.title } }]
        : [
              {
                  __isNew__: true,
                  label: { primary: choice.title },
                  value: choice.title,
              },
          ];
};

const choiceOf = (option: SelectOption | undefined): SongChoice | null => {
    if (option === undefined) {
        return null;
    }

    const title =
        typeof option.label === "object"
            ? option.label.primary
            : String(option.label);

    // Their own rule: a created option carries the typed text, not an id.
    return option.__isNew__ === true || typeof option.value !== "number"
        ? { kind: "new", title }
        : { kind: "song", songId: option.value, title };
};

export const SongSelect = ({
    asText,
    initialText,
    label,
    onSelect,
    placeholder,
    suggestions,
    value,
}: SongSelectProps): PageElement => {
    const prefilled = initialText !== undefined && initialText !== "";

    return (
        <TagInput
            ariaAttributes={{ "aria-label": label }}
            controlledValue={asText === true ? [] : optionFor(value)}
            creatablePreservesOnBlur={prefilled}
            customStyles={MENU_STYLES}
            defaultOptions={suggestions ?? true}
            isCreatable
            isMulti={false}
            isSortable={false}
            loadOptions={loadSongOptions}
            onChange={(next) => {
                onSelect(choiceOf(next[0]));
            }}
            placeholder={placeholder ?? "Add a song…"}
            preservesOnBlur={prefilled}
            promptMessage="Start typing to search existing songs"
            reactSelectProps={
                prefilled
                    ? { ...SELECT_PROPS, defaultInputValue: initialText }
                    : SELECT_PROPS
            }
            valueBackgroundKey="variant"
        />
    );
};

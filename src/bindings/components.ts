import { Result } from "@resulted/results";
import type { BindingError } from "./errors";
import {
    findByDisplayName,
    findByPropTypes,
    findByStyledNamespace,
    findDeviceComponent,
    selectExport,
} from "./finders";
import { type Binding, loadChunk, memoBinding } from "./loader";
import {
    asPageValue,
    type ModuleNamespace,
    type PageComponent,
    type PageElement,
    type PageNode,
    type PageSyntheticEvent,
} from "./types";

/** One accessor per borrowed component. Prop names read from chunks. */

type Bind<Props> = Binding<PageComponent<Props>>;

const bind = <Props>(
    chunk: string,
    find: (ns: ModuleNamespace) => Result<unknown, BindingError>,
): Bind<Props> =>
    memoBinding(async () => {
        const ns = await loadChunk(chunk);

        if (ns.isErr()) {
            return ns;
        }

        const found = find(ns.value);

        if (found.isErr()) {
            return found;
        }

        return Result.ok(asPageValue<PageComponent<Props>>(found.value));
    });

/** Props every borrowed component forwards to its underlying element. */
export interface PassThroughProps {
    readonly className?: string;
    readonly id?: string;
    readonly onClick?: (event: PageSyntheticEvent) => void;
    readonly "aria-label"?: string;
    readonly "data-testid"?: string;
}

/** The primary action button, with `loading` and `success` states. */
export interface ButtonProps extends PassThroughProps {
    readonly children: PageNode;
    /** Solid green "saved" styling. */
    readonly success?: boolean;
    /** Foreground and background swapped. */
    readonly inverted?: boolean;
    /** Borderless and underlined. */
    readonly secondary?: boolean;
    /** Disables the button and shows the inline spinner. */
    readonly loading?: boolean;
    readonly disabled?: boolean;
    readonly subtitle?: string | null;
    /** A `theme.fontSize` key; defaults to `"reading"`. */
    readonly size?: string;
    readonly type?: "button" | "submit" | "reset";
}

/**
 * Binds Genius's `Button`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
/** Everything their own icons take, which is anything an `svg` does. */
export interface IconProps {
    readonly className?: string;
    readonly width?: number | string;
    readonly height?: number | string;
    readonly role?: string;
    readonly "aria-label"?: string;
    readonly "aria-hidden"?: boolean;
}

/** react's own marker for the `forwardRef` each of their icons is. */
const FORWARD_REF = Symbol.for("react.forward_ref");

const isIcon = (value: unknown): boolean =>
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === FORWARD_REF;

/**
 * One of their own icons, each its own chunk exporting one component.
 *
 * Drawn their way by construction rather than by imitation: a solid
 * fill in `currentColor` with no stroke, on their own viewBox.
 */
const bindIcon = (chunk: string): Bind<IconProps> =>
    bind(chunk, (ns) => selectExport(ns, `the ${chunk} icon`, isIcon));

/** A plus. Not on every page: the import page borrows it from `/new`. */
export const getPlusIcon = bindIcon("plus");

/** A ring and an exclamation. Not on every page either. */
export const getWarningIcon = bindIcon("warning");

/** A tick. On song pages only, which the import borrows from late. */
export const getCheckIcon = bindIcon("check");

/** A warning triangle, which every page they render carries. */
export const getAlertIcon = bindIcon("alert");

export const getButton: Bind<ButtonProps> = bind("Button", (ns) =>
    findByDisplayName(ns, "Button"),
);

/** The compact button, for toolbars and inline actions. */
export interface SmallButtonProps extends PassThroughProps {
    readonly children: PageNode;
    readonly type?: "button" | "submit" | "reset";
    readonly inverted?: boolean;
    readonly secondary?: boolean;
    readonly loading?: boolean;
    readonly disabled?: boolean;
}

/**
 * Binds Genius's `SmallButton`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getSmallButton: Bind<SmallButtonProps> = bind(
    "SmallButton",
    (ns) => findByDisplayName(ns, "SmallButton"),
);

/** A button that reads as an underlined link. */
export interface LinkButtonProps extends PassThroughProps {
    readonly children: PageNode;
    readonly type?: "button" | "submit" | "reset";
    /** A `theme.fontSize` key, or `"inherit"`. Defaults to `"reading"`. */
    readonly fontSize?: string;
    /** A `theme.fontWeight` key. Defaults to `"normal"`. */
    readonly fontWeight?: string;
    readonly disabled?: boolean;
}

/**
 * Binds Genius's `LinkButton`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getLinkButton: Bind<LinkButtonProps> = bind("LinkButton", (ns) =>
    findByDisplayName(ns, "LinkButton"),
);

/** The text field; `as="textarea"` makes it multiline. */
export interface TextInputProps extends PassThroughProps {
    /** Renders as a different tag; `"textarea"` is the common use. */
    readonly as?: string;
    readonly disabled?: boolean;
    /** Paints the border in `theme.color.accent.main`. */
    readonly hasError?: boolean;
    readonly type?: string;
    readonly value?: string;
    readonly defaultValue?: string;
    readonly placeholder?: string;
    readonly onChange?: (event: PageSyntheticEvent) => void;
    readonly fullWidth?: boolean;
    /** `theme.space` keys; `paddingKey` overrides both axes. */
    readonly paddingKey?: string;
    readonly paddingKeyX?: string;
    readonly paddingKeyY?: string;
    readonly dataTestId?: string;
}

/**
 * Binds Genius's `TextInput`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getTextInput: Bind<TextInputProps> = bind("TextInput", (ns) =>
    findByDisplayName(ns, "TextInput"),
);

/** Genius's checkbox, checkmark styling included. */
export interface CheckboxProps extends PassThroughProps {
    readonly as?: string;
    readonly disabled?: boolean;
    readonly hasError?: boolean;
    readonly type?: string;
    readonly value?: string;
    readonly checked?: boolean;
    readonly onChange?: (event: PageSyntheticEvent) => void;
    readonly dataTestId?: string;
}

/**
 * Binds Genius's `Checkbox`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getCheckbox: Bind<CheckboxProps> = bind("Checkbox", (ns) =>
    findByDisplayName(ns, "Checkbox"),
);

/** The inline spinner, sized in `em` off the surrounding text. */
export interface SpinnerProps extends PassThroughProps {
    /** Sized in `em`, so it follows the surrounding font size. */
    readonly style?: Readonly<Record<string, string | number>>;
}

/**
 * Binds Genius's `Spinner`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getSpinner: Bind<SpinnerProps> = bind("Spinner", (ns) =>
    findByDisplayName(ns, "Spinner"),
);

/** A tag chip's two-line label: `primary` above `secondary`. */
export interface SelectOptionLabel {
    readonly primary: string;
    readonly secondary?: string;
    readonly secondaryPrefix?: string;
}

/** react-select's pair. Their `propTypes` under-declare both halves. */
export interface SelectOption {
    readonly label: string | number | SelectOptionLabel;
    readonly value: string | number;
    /** react-select's own marker for a freshly created option. */
    readonly __isNew__?: boolean;
}

/** A single-choice dropdown, built on react-select. */
export interface SelectInputProps {
    readonly options: readonly SelectOption[];
    readonly id?: string;
    readonly inputId?: string;
    readonly className?: string;
    readonly dataTestId?: string;
    readonly defaultValue?: SelectOption | null;
    readonly disabled?: boolean;
    readonly isClearable?: boolean;
    readonly onChange?: (option: SelectOption | null) => void;
    readonly placeholder?: string;
    readonly controlledValue?: SelectOption | null;
    /** Passed straight through to react-select. Shape unverified. */
    readonly customStyles?: Readonly<Record<string, unknown>>;
    readonly selectProps?: Readonly<Record<string, unknown>>;
    readonly ariaAttributes?: Readonly<Record<string, string>>;
}

/**
 * Binds `SelectInput`, found by its styled statics, not a name.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getSelectInput: Bind<SelectInputProps> = bind(
    "SelectInput",
    (ns) => findByStyledNamespace(ns, "SelectInput"),
);

/** The multi-value tag and artist picker, with async options. */
export interface TagInputProps {
    /** Async option source. Required by their propTypes. */
    readonly loadOptions: (input: string) => Promise<readonly SelectOption[]>;
    /** Required by their propTypes; shown above the option list. */
    readonly promptMessage: string;
    readonly id?: string;
    readonly inputId?: string;
    readonly className?: string;
    readonly dataTestId?: string;
    readonly defaultValue?: readonly SelectOption[];
    readonly defaultOptions?: boolean | readonly SelectOption[];
    readonly controlledValue?: readonly SelectOption[];
    readonly disabled?: boolean;
    readonly isCreatable?: boolean;
    readonly isMulti?: boolean;
    readonly isSortable?: boolean;
    readonly preservesOnBlur?: boolean;
    readonly creatablePreservesOnBlur?: boolean;
    readonly placeholder?: string;
    readonly secondaryPrefix?: string;
    /** A `theme.color` path used for the tag chips. */
    readonly valueBackgroundKey?: string;
    readonly focusId?: string;
    readonly onChange?: (value: readonly SelectOption[]) => void;
    readonly onSelection?: (option: SelectOption) => void;
    readonly customStyles?: Readonly<Record<string, unknown>>;
    readonly reactSelectProps?: Readonly<Record<string, unknown>>;
    readonly ariaAttributes?: Readonly<Record<string, string>>;
}

/**
 * Binds Genius's `TagInput`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getTagInput: Bind<TagInputProps> = bind("TagInput", (ns) =>
    findByDisplayName(ns, "TagInput"),
);

/** Genius's release date shape, everywhere: `null` means "not set". */
export interface DateComponents {
    readonly year: number | null;
    readonly month: number | null;
    readonly day: number | null;
}

/** Three dropdowns in a row; the month drives how many days it offers. */
export interface DateInputProps {
    /** Always called with all three parts, not just the one that moved. */
    readonly onChange: (value: DateComponents) => void;
    readonly year?: number | null;
    readonly month?: number | null;
    readonly day?: number | null;
    readonly disabled?: boolean;
    /** Puts the "clear" affordance on each dropdown. Defaults to true. */
    readonly clearable?: boolean;
    readonly minimumYear?: number;
    readonly className?: string;
    /** react-select styles, forwarded to all three dropdowns. */
    readonly customStyles?: Readonly<Record<string, unknown>>;
    /** Overrides the `aria-label` of each dropdown. */
    readonly customLabels?: {
        readonly month?: string;
        readonly day?: string;
        readonly year?: string;
    };
}

/**
 * The plain controlled input, not the form-bound `DateField`.
 * @returns The component, which needs the page's redux context.
 */
export const getDateInput: Bind<DateInputProps> = bind(
    "useAvailableRoles",
    (ns) => findByDisplayName(ns, "DateInput"),
);

/** The label and validation wrapper; it clones its single child. */
export interface FieldProps {
    /** Exactly one element; `Field` clones it and injects form wiring. */
    readonly children: PageElement;
    readonly label: string;
    readonly name: string;
    readonly id?: string;
    readonly className?: string;
    readonly defaultValue?: unknown;
    readonly disabled?: boolean;
    readonly helpText?: string;
    readonly hideLabel?: boolean;
    readonly floatingLabel?: boolean;
    readonly inlineLabel?: boolean;
    readonly asFieldset?: boolean;
    readonly wrapWithLabel?: boolean;
    readonly isInputControlled?: boolean;
    readonly infoTooltip?: {
        readonly label: string;
        readonly content: PageNode;
    };
    /** react-hook-form rules; `{ required: true }` also marks the label. */
    readonly rules?: Readonly<Record<string, unknown>>;
    readonly onChangeValue?: (value: unknown) => void;
    readonly transformForForm?: (value: unknown) => unknown;
    readonly transformForInput?: (value: unknown) => unknown;
}

/**
 * Binds `Field`, identified by prop names since it has none.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getField: Bind<FieldProps> = bind("Field", (ns) =>
    findByPropTypes(ns, "Field", [
        "wrapWithLabel",
        "transformForForm",
        "isInputControlled",
        "asFieldset",
    ]),
);

/** What `renderToggle` is handed on each render. */
export interface DropdownToggleState {
    readonly isVisible: boolean;
    readonly hovering: boolean;
    readonly onClick: () => void;
}

/** A dropdown panel whose toggle the caller renders. */
export interface DropdownProps {
    readonly children: (api: { readonly onClose: () => void }) => PageNode;
    readonly renderToggle: (state: DropdownToggleState) => PageNode;
    readonly hover?: boolean;
    readonly toggleElementProps?: Readonly<Record<string, unknown>>;
    readonly onOpen?: () => void;
    /** Renders the panel into `document.body` at a fixed position. */
    readonly portal?: boolean;
}

/**
 * Binds Genius's `Dropdown`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getDropdown: Bind<DropdownProps> = bind("Dropdown", (ns) =>
    findByStyledNamespace(ns, "Dropdown"),
);

/** A dropdown whose panel is a list of selectable rows. */
export interface DropdownListProps {
    /** One element per row; each is wrapped in an `<li role="option">`. */
    readonly items: readonly PageNode[];
    readonly small?: boolean;
    readonly align?: "left" | "center" | "right";
    readonly icon?: PageElement;
    readonly label?: string;
    /** Required when `label` is absent; their propTypes enforce it. */
    readonly ariaLabel?: string;
    readonly disabled?: boolean;
    readonly secondary?: boolean;
    readonly onOpen?: () => void;
    readonly portal?: boolean;
}

/**
 * Binds Genius's `DropdownList`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getDropdownList: Bind<DropdownListProps> = bind(
    "DropdownList",
    (ns) => findByStyledNamespace(ns, "DropdownList"),
);

/** One song or album card, as the discography grids render it. */
export interface DiscographyItemProps {
    readonly id: number;
    readonly schema: "songs" | "albums";
    readonly coverSize: "grow" | "large" | "small";
    readonly section: string;
    readonly showInfo?:
        | "popularity"
        | "release_date"
        | "unreviewed_annotations"
        | "lyrics_edit_proposals";
    readonly horizontal?: boolean;
    readonly leftAlign?: boolean;
    readonly showArtist?: boolean;
    readonly clickEventName?: string;
    readonly clickEventProps?: Readonly<Record<string, unknown>>;
    readonly className?: string;
}

/**
 * Binds one discography card.
 * @returns The component, which reads its entity from redux by id.
 */
export const getDiscographyItem: Bind<DiscographyItemProps> = bind(
    "DiscographyItemList",
    (ns) => findByDisplayName(ns, "DiscographyItem"),
);

/** A grid or column of discography cards. */
export interface DiscographyItemListProps {
    readonly items: readonly number[];
    readonly section: string;
    readonly schema: "songs" | "albums";
    readonly layout: "large" | "single-column" | "double-column";
    readonly showInfo?: "popularity" | "release_date";
    readonly showArtist?: boolean;
    readonly itemClickEventName?: string;
    readonly itemClickEventProps?: Readonly<Record<string, unknown>>;
    readonly className?: string;
}

/**
 * Binds Genius's `DiscographyItemList`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getDiscographyItemList: Bind<DiscographyItemListProps> = bind(
    "DiscographyItemList",
    (ns) => findByStyledNamespace(ns, "DiscographyItemList"),
);

/** A label and value row, which stacks on mobile. */
export interface MetadataRowProps {
    readonly children?: PageNode;
    /** Desktop only; the mobile variant always stacks. */
    readonly direction?: "row" | "column";
    readonly className?: string;
}

/**
 * Binds `MetadataRow`, whose chunk holds two identically named pairs.
 * @returns The device pair; see `findDeviceComponent`.
 */
export const getMetadataRow: Bind<MetadataRowProps> = bind(
    "MetadataRow",
    (ns) => findDeviceComponent(ns, "MetadataRow"),
);

/** `MetadataField` takes the same props as `Field`. */
export type MetadataFieldProps = FieldProps;

/**
 * Binds `MetadataField`, the editable half of a metadata row.
 * @returns The device pair; see `findDeviceComponent`.
 */
export const getMetadataField: Bind<MetadataFieldProps> = bind(
    "MetadataRow",
    (ns) => findDeviceComponent(ns, "MetadataField"),
);

/** One tab: its name, its section, and an optional shortcut. */
export interface ScrollableTabsTab {
    readonly name: string;
    readonly section: PageNode;
    readonly shortcut?: {
        readonly keys?: string;
        readonly callback?: () => void;
        readonly display?: string;
    };
}

/** Tabbed navigation linked to the scroll position of its sections. */
export interface ScrollableTabsProps {
    readonly tabs: readonly ScrollableTabsTab[];
    readonly initialActiveSectionIndex?: number;
    readonly onTabClick?: (index: number) => void;
    readonly onNavigated?: (index: number) => void;
    readonly scrollingElementId?: string;
    readonly postNavDisplay?: PageNode;
    readonly navTrailing?: PageNode;
    readonly contentHeader?: PageNode;
    readonly contentPlaceholder?: PageNode;
    readonly showShortcuts?: boolean;
    readonly className?: string;
}

/**
 * Binds Genius's `ScrollableTabs`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getScrollableTabs: Bind<ScrollableTabsProps> = bind(
    "EditMetadataModal",
    (ns) => findByDisplayName(ns, "ScrollableTabs"),
);

/** One rendered row; both renderers are handed it. */
export interface RepeatableInputPairRow {
    readonly category?: PageNode;
    readonly value?: PageNode;
}

/** Paired inputs per row, with add and remove controls. */
export interface RepeatableInputPairProps {
    /** One entry per rendered row; the renderers receive each entry. */
    readonly rows: readonly RepeatableInputPairRow[];
    readonly renderCategory: (row: RepeatableInputPairRow) => PageNode;
    readonly renderValue: (row: RepeatableInputPairRow) => PageNode;
    readonly addButtonText?: string;
    readonly allowAddRow?: boolean;
    readonly centerButton?: boolean;
    readonly disabled?: boolean;
    readonly marginTop?: string;
    readonly onAddClick?: () => void;
    readonly onRemoveClick?: (index: number) => void;
    readonly renderAfter?: PageNode;
}

/**
 * Binds Genius's `RepeatableInputPair`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getRepeatableInputPair: Bind<RepeatableInputPairProps> = bind(
    "EditMetadataModal",
    (ns) => findByDisplayName(ns, "RepeatableInputPair"),
);

/** Everything their metadata editor needs to drive a save. */
export interface EditMetadataModalProps {
    readonly entityId: number;
    /** `"songs"`, `"albums"`, and so on: the redux slice name. */
    readonly schema: string;
    readonly defaultValues: Readonly<Record<string, unknown>>;
    readonly isEditingMetadata: boolean;
    /** Redux action creator, called with the next open state. */
    readonly setIsEditingMetadataAction: (open: boolean) => unknown;
    /** Redux thunk or RTK Query mutation used to save. */
    readonly submitAction: (payload: unknown) => unknown;
    readonly createSections: (...args: readonly unknown[]) => unknown;
    readonly serverErrorFieldMapping?: Readonly<Record<string, string>>;
    readonly transformPayload?: (payload: unknown, values: unknown) => unknown;
    readonly transformResponseOnReset?: (response: unknown) => unknown;
    readonly trackFieldEventsOnSuccess?: (
        ...args: readonly unknown[]
    ) => unknown;
    readonly updateStatus?: string;
    readonly initialModalSectionId?: string;
    readonly formResetEventName?: string;
    readonly FormContentWrapper?: PageComponent<{
        readonly children?: PageNode;
    }>;
}

/**
 * The whole metadata editor, which drives its own submission.
 * @returns The component, which needs the page's redux Provider.
 */
export const getEditMetadataModal: Bind<EditMetadataModalProps> = bind(
    "EditMetadataModal",
    (ns) =>
        findByPropTypes(ns, "EditMetadataModal", [
            "entityId",
            "setIsEditingMetadataAction",
            "createSections",
            "FormContentWrapper",
        ]),
);

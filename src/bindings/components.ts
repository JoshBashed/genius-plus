import { Result } from "@resulted/results";
import type { FC, ReactNode, SyntheticEvent } from "react";
import type { BindingError } from "@/bindings/errors";
import {
    findByDisplayName,
    findByStyledNamespace,
    selectExport,
} from "@/bindings/finders";
import {
    type Binding,
    loadChunk,
    loadChunkExporting,
    memoBinding,
} from "@/bindings/loader";
import { asPageValue, type ModuleNamespace } from "@/bindings/types";

/** One accessor per borrowed component. Prop names read from chunks. */

type Bind<Props> = Binding<FC<Props>>;

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

        return Result.ok(asPageValue<FC<Props>>(found.value));
    });

/**
 * Binds a component by its display name, wherever Genius put it.
 * @param own The chunk it lives in unless Genius moved it.
 */
const bindNamed = <Props>(name: string, own?: string): Bind<Props> =>
    memoBinding(async () => {
        const ns = await loadChunkExporting(name, own);

        if (ns.isErr()) {
            return ns;
        }

        const found = findByDisplayName(ns.value, name);

        return found.isOk()
            ? Result.ok(asPageValue<FC<Props>>(found.value))
            : found;
    });

/** Props every borrowed component forwards to its underlying element. */
export interface PassThroughProps {
    readonly className?: string;
    readonly id?: string;
    readonly onClick?: (event: SyntheticEvent) => void;
    readonly "aria-label"?: string;
    readonly "data-testid"?: string;
}

/** The primary action button, with `loading` and `success` states. */
export interface ButtonProps extends PassThroughProps {
    readonly children: ReactNode;
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

/** A plus. */
export const getPlusIcon = bindIcon("plus");

/** A ring and an exclamation. */
export const getWarningIcon = bindIcon("warning");

/** A tick. */
export const getCheckIcon = bindIcon("check");

/** A warning triangle. */
export const getAlertIcon = bindIcon("alert");

export const getButton: Bind<ButtonProps> = bindNamed("Button");

/** The compact button, for toolbars and inline actions. */
export interface SmallButtonProps extends PassThroughProps {
    readonly children: ReactNode;
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
export const getSmallButton: Bind<SmallButtonProps> = bindNamed("SmallButton");

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
    readonly onChange?: (event: SyntheticEvent) => void;
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
export const getTextInput: Bind<TextInputProps> = bindNamed("TextInput");

/** Genius's checkbox, checkmark styling included. */
export interface CheckboxProps extends PassThroughProps {
    readonly as?: string;
    readonly disabled?: boolean;
    readonly hasError?: boolean;
    readonly type?: string;
    readonly value?: string;
    readonly checked?: boolean;
    readonly onChange?: (event: SyntheticEvent) => void;
    readonly dataTestId?: string;
}

/**
 * Binds Genius's `Checkbox`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getCheckbox: Bind<CheckboxProps> = bindNamed("Checkbox");

/** The inline spinner, sized in `em` off the surrounding text. */
export interface SpinnerProps extends PassThroughProps {
    /** Sized in `em`, so it follows the surrounding font size. */
    readonly style?: Readonly<Record<string, string | number>>;
}

/**
 * Binds Genius's `Spinner`.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getSpinner: Bind<SpinnerProps> = bindNamed("Spinner");

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
export const getTagInput: Bind<TagInputProps> = bindNamed("TagInput");

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
export const getDateInput: Bind<DateInputProps> = bindNamed(
    "DateInput",
    "useAvailableRoles",
);

/** What `renderToggle` is handed on each render. */
export interface DropdownToggleState {
    readonly isVisible: boolean;
    readonly hovering: boolean;
    readonly onClick: () => void;
}

/** A dropdown panel whose toggle the caller renders. */
export interface DropdownProps {
    readonly children: (api: { readonly onClose: () => void }) => ReactNode;
    readonly renderToggle: (state: DropdownToggleState) => ReactNode;
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

/** Every borrowed component, each read at render rather than at import. */

// Safe to import from anywhere now: a module here holds a slot and reads
// nothing until something renders it, so importing one name no longer
// evaluates a binding that this page never installed.

export { Button, buttonSlot } from "@/content/genius/components/genius/Button";
export {
    Checkbox,
    checkboxSlot,
} from "@/content/genius/components/genius/Checkbox";
export {
    DateInput,
    dateInputSlot,
} from "@/content/genius/components/genius/DateInput";
export {
    Dropdown,
    dropdownSlot,
    hasDropdown,
} from "@/content/genius/components/genius/Dropdown";
export {
    alertIconSlot,
    checkIconSlot,
    Icon,
    type IconName,
    plusIconSlot,
    warningIconSlot,
} from "@/content/genius/components/genius/Icon";
export {
    SelectInput,
    selectInputSlot,
} from "@/content/genius/components/genius/SelectInput";
export {
    SmallButton,
    smallButtonSlot,
} from "@/content/genius/components/genius/SmallButton";
export {
    Spinner,
    spinnerSlot,
} from "@/content/genius/components/genius/Spinner";
export {
    setStyled,
    setTheme,
    styled,
    styledSlot,
    theme,
    themeSlot,
} from "@/content/genius/components/genius/styled";
export {
    TagInput,
    tagInputSlot,
} from "@/content/genius/components/genius/TagInput";
export {
    TextInput,
    textInputSlot,
} from "@/content/genius/components/genius/TextInput";

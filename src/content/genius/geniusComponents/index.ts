/** Every borrowed component, each read at render rather than at import. */

// Safe to import from anywhere now: a module here holds a slot and reads
// nothing until something renders it, so importing one name no longer
// evaluates a binding that this page never installed.

export { Button, buttonSlot } from "@/content/genius/geniusComponents/Button";
export {
    Checkbox,
    checkboxSlot,
} from "@/content/genius/geniusComponents/Checkbox";
export {
    DateInput,
    dateInputSlot,
} from "@/content/genius/geniusComponents/DateInput";
export {
    Dropdown,
    dropdownSlot,
    hasDropdown,
} from "@/content/genius/geniusComponents/Dropdown";
export {
    alertIconSlot,
    checkIconSlot,
    Icon,
    type IconName,
    plusIconSlot,
    warningIconSlot,
} from "@/content/genius/geniusComponents/Icon";
export {
    SelectInput,
    selectInputSlot,
} from "@/content/genius/geniusComponents/SelectInput";
export {
    SmallButton,
    smallButtonSlot,
} from "@/content/genius/geniusComponents/SmallButton";
export {
    Spinner,
    spinnerSlot,
} from "@/content/genius/geniusComponents/Spinner";
export {
    setStyled,
    setTheme,
    styled,
    styledSlot,
    theme,
    themeSlot,
} from "@/content/genius/geniusComponents/styled";
export {
    TagInput,
    tagInputSlot,
} from "@/content/genius/geniusComponents/TagInput";
export {
    TextInput,
    textInputSlot,
} from "@/content/genius/geniusComponents/TextInput";

/** Every borrowed component, each read at render rather than at import. */

// Safe to import from anywhere now: a module here holds a slot and reads
// nothing until something renders it, so importing one name no longer
// evaluates a binding that this page never installed.

export { Button, buttonSlot, hasButton, setButton } from "./Button";
export { Checkbox, checkboxSlot, hasCheckbox, setCheckbox } from "./Checkbox";
export {
    DateInput,
    dateInputSlot,
    hasDateInput,
    setDateInput,
} from "./DateInput";
export { Dropdown, dropdownSlot, hasDropdown, setDropdown } from "./Dropdown";
export {
    alertIconSlot,
    checkIconSlot,
    Icon,
    type IconName,
    plusIconSlot,
    setAlertIcon,
    setCheckIcon,
    setPlusIcon,
    setWarningIcon,
    warningIconSlot,
} from "./Icon";
export {
    hasSelectInput,
    SelectInput,
    selectInputSlot,
    setSelectInput,
} from "./SelectInput";
export {
    hasSmallButton,
    SmallButton,
    setSmallButton,
    smallButtonSlot,
} from "./SmallButton";
export { hasSpinner, Spinner, setSpinner, spinnerSlot } from "./Spinner";
export {
    setStyled,
    setTheme,
    styled,
    styledSlot,
    theme,
    themeSlot,
} from "./styled";
export { hasTagInput, setTagInput, TagInput, tagInputSlot } from "./TagInput";
export {
    hasTextInput,
    setTextInput,
    TextInput,
    textInputSlot,
} from "./TextInput";

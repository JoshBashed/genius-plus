/** Genius's own icons, each read at render rather than at import. */
import type { IconProps, PageComponent, PageElement } from "@/bindings";
import { log } from "@/utilities/log";
import { slot } from "../reactHost/binding";
import { createElement, Fragment } from "../reactHost/react";

/**
 * The ones this extension asks for.
 *
 * Which of these a page carries is not a given: only `alert` is on
 * every page they render. The 404 the import stands on borrows `plus`
 * and `warning` from their Add A Song form, and `check` from a song
 * page, which it only knows once an album has been settled on.
 */
export type IconName = "plus" | "check" | "warning" | "alert";

const SLOTS: Readonly<
    Record<IconName, ReturnType<typeof slot<PageComponent<IconProps>>>>
> = {
    alert: slot<PageComponent<IconProps>>("Genius's alert icon"),
    check: slot<PageComponent<IconProps>>("Genius's check icon"),
    plus: slot<PageComponent<IconProps>>("Genius's plus icon"),
    warning: slot<PageComponent<IconProps>>("Genius's warning icon"),
};

export const alertIconSlot = SLOTS.alert;
export const checkIconSlot = SLOTS.check;
export const plusIconSlot = SLOTS.plus;
export const warningIconSlot = SLOTS.warning;

export const setAlertIcon = SLOTS.alert.set;
export const setCheckIcon = SLOTS.check.set;
export const setPlusIcon = SLOTS.plus.set;
export const setWarningIcon = SLOTS.warning.set;

/** One line per name set, not one per row that renders. */
const warned = new Set<string>();

const said = (names: readonly IconName[]): void => {
    const key = names.join(",");

    if (warned.has(key)) {
        return;
    }

    warned.add(key);
    log.warn(
        "genius: icon",
        `this page bound none of ${key}: ${names
            .map(
                (name) =>
                    `${name} (${SLOTS[name].reason() ?? "not asked for"})`,
            )
            .join("; ")}`,
    );
};

export interface IconSlotProps extends IconProps {
    /** In order of preference, because a page carries what it carries. */
    readonly names: readonly IconName[];
}

/**
 * The first of `names` this page actually bound.
 * @returns Nothing at all when it bound none of them.
 */
export const Icon = ({ names, ...props }: IconSlotProps): PageElement => {
    for (const name of names) {
        const found = SLOTS[name].peek();

        if (found !== null) {
            return createElement<IconProps>(found, props);
        }
    }

    // Nothing, rather than a shape of our own: the label beside it is
    // what carries the state when a page brought no icon. Said once,
    // because an icon that renders nothing and reports nothing is the
    // hardest kind of missing to account for.
    said(names);

    return createElement(Fragment, null);
};

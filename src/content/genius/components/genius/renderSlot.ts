/** A borrowed component, or nothing when this page does not have it. */
import { createElement, type FC, type ReactElement } from "react";
import { describeBindingError } from "@/bindings";
import type { Slot } from "@/content/genius/utilities/slot";
import { log } from "@/utilities/log";

/** One warning per slot, not one per row that renders it. */
const warned = new WeakSet<object>();

/**
 * Renders the slot's component, or nothing with a single warning.
 * One missing part must not take the rest of the tree down with it.
 */
export const renderSlot = <Props extends object>(
    slot: Slot<FC<Props>>,
    props: Props,
): ReactElement | null => {
    const component = slot.peek();

    if (component !== null) {
        return createElement(component, props);
    }

    if (!warned.has(slot)) {
        warned.add(slot);
        log.warn("genius: component", describeBindingError(slot.missing()));
    }

    return null;
};

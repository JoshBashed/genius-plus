/**
 * Genius's `Modal`.
 */

import type { Result } from "@resulted/results";
import type { FC, ReactNode } from "react";
import type { BindingError } from "@/bindings/errors";
import { readProperty, selectExport } from "@/bindings/finders";
import { type Binding, loadChunk, memoBinding } from "@/bindings/loader";
import { borrowComponent, type ModuleNamespace } from "@/bindings/types";

/** Rollup named this chunk after an unrelated hook it also contains. */
const MODAL_CHUNK = "useAnnotationTracking";

/** Props Genius's own `Modal` destructures. */
export interface ModalProps {
    readonly show: boolean;
    readonly onClose: () => void;
    readonly children: ReactNode;
    /** Renders the save control inside the modal's own `Controls`. */
    readonly onSave?: () => void;
    readonly isSaveActive?: boolean;
    readonly saveLabel?: string;
    readonly hideControls?: boolean;
    readonly closeLabel?: string;
    readonly position?: "center" | "top";
    readonly bodyWidth?: string;
    readonly bodyId?: string;
    readonly overlayId?: string;
    readonly trackingName?: string;
    readonly zIndexPosition?: string;
    readonly onAfterClose?: () => void;
}

/** The only export in this chunk carrying a `displayName` at all. */
const DEVICE_PREFIX = "DeviceComponent(";

/** The modal's device helper yields a `forwardRef`, not a styled tag. */
const findDevicePair = (ns: ModuleNamespace): Result<unknown, BindingError> =>
    selectExport(ns, "Modal (responsive pair)", (value) => {
        const name = readProperty(value, "displayName");

        return typeof name === "string" && name.startsWith(DEVICE_PREFIX);
    });

const bindModal = memoBinding<FC<ModalProps>>(async () => {
    const ns = await loadChunk(MODAL_CHUNK);

    if (ns.isErr()) {
        return ns;
    }

    const found = findDevicePair(ns.value);

    return found.isOk()
        ? borrowComponent<ModalProps>(found.value, "Modal")
        : found;
});

/**
 * Genius's `Modal` (cached): the desktop and mobile pair.
 * @returns The component, or a `binding` error if the chunk moved.
 */
export const getModal: Binding<FC<ModalProps>> = () => bindModal();

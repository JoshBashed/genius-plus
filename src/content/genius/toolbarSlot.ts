/** A slot in Genius's own tracklist dropdown, for our entry point. */

const ITEMS = '[class*="StickyToolbarDropdown__DropdownItems"]';
const ITEM = '[class*="StickyToolbarDropdownItem__Container"]';
const SLOT_ID = "genius-plus-toolbar-item";

export interface ToolbarSlot {
    /** An `li` appended to their list, ready to be portalled into. */
    readonly host: HTMLElement;
    /** Copied off a sibling, so the hashed class survives a redeploy. */
    readonly buttonClassName: string;
}

const findSlot = (): ToolbarSlot | null => {
    const list = document.querySelector(ITEMS);

    if (list === null) {
        return null;
    }

    const sibling = list.querySelector(`${ITEM}:not(#${SLOT_ID})`);
    const buttonClassName = sibling?.querySelector("button")?.className ?? "";
    const existing = document.getElementById(SLOT_ID);

    if (existing !== null && list.contains(existing)) {
        return { buttonClassName, host: existing };
    }

    const host = document.createElement("li");
    host.id = SLOT_ID;
    host.className = sibling?.className ?? "";
    list.append(host);

    return { buttonClassName, host };
};

/**
 * Watches for the dropdown, which Genius replaces freely.
 * @returns A function that stops watching.
 */
export const observeToolbarSlot = (
    onChange: (slot: ToolbarSlot | null) => void,
): (() => void) => {
    let current: HTMLElement | null = null;
    let queued = false;

    const sync = (): void => {
        queued = false;
        const slot = findSlot();

        // Coalesced, so `null` both sides has to compare equal too.
        if ((slot?.host ?? null) === current) {
            return;
        }

        current = slot?.host ?? null;
        onChange(slot);
    };

    const observer = new MutationObserver(() => {
        if (queued) {
            return;
        }

        queued = true;
        requestAnimationFrame(sync);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    sync();

    return () => {
        observer.disconnect();
        document.getElementById(SLOT_ID)?.remove();
    };
};

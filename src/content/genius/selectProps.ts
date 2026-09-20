/** What every borrowed react-select is handed, wherever one renders. */

/**
 * react-select's menu, portalled out of whatever scroller holds it.
 * Both the album table and the import page put selects inside their own
 * scrollers, so a menu opening near the bottom is otherwise clipped.
 */
export const PORTAL_PROPS: Readonly<Record<string, unknown>> = {
    menuPortalTarget: document.body,
    menuPosition: "fixed",
};

/** The portalled menu's stacking, since the portal leaves the panel. */
export const MENU_STYLES: Readonly<Record<string, unknown>> = {
    menuPortal: (base: Record<string, unknown>) => ({
        ...base,
        zIndex: 2147483000,
    }),
};

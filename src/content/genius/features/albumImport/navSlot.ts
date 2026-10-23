/** Our own link in Genius's sticky nav, beside their "Add A Song". */

/** The flat row of nav links; not a list, so an anchor is the child. */
const CONTAINER = '[class*="StickyNavSiteLinks__DesktopContainer"]';

/**
 * Their own "Add A Song", which is both the donor and the neighbour.
 * Its second class is a styled-components hash that differs between
 * pages and between their builds, so it is copied, never written down.
 */
const DONOR = 'a[href="/new"][class*="StickyNavSectionLink__StyledLink"]';

const LINK_ID = "genius-plus-nav-item";

export interface NavLink {
    readonly href: string;
    readonly label: string;
}

/** Puts the link after theirs, or corrects the one already there. */
const settle = (link: NavLink): void => {
    const container = document.querySelector(CONTAINER);
    const donor = document.querySelector(DONOR);

    if (container === null || donor === null) {
        return;
    }

    const existing = document.getElementById(LINK_ID);
    const anchor =
        existing instanceof HTMLAnchorElement && container.contains(existing)
            ? existing
            : document.createElement("a");

    if (anchor.id !== LINK_ID) {
        anchor.id = LINK_ID;
        anchor.textContent = link.label;
        anchor.href = link.href;
        anchor.dataset.active = "false";
        // A flat flex row, so appending is all "next to" has to mean.
        container.append(anchor);
    }

    if (anchor.className !== donor.className) {
        anchor.className = donor.className;
    }
};

/**
 * Keeps the link in the nav for as long as the page lives.
 *
 * Their nav survives client side navigation but is React rendered, so
 * this re-checks rather than injecting once.
 *
 * @returns A function that stops watching and removes the link.
 */
export const watchNav = (link: NavLink): (() => void) => {
    const observer = new MutationObserver(() => {
        settle(link);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    settle(link);

    return () => {
        observer.disconnect();
        document.getElementById(LINK_ID)?.remove();
    };
};

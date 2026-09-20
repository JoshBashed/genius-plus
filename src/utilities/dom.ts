/**
 * Runs `callback` now and on every subtree mutation, coalesced by frame.
 * @returns A function that stops observing.
 */
export const observeSubtree = (
    callback: () => void,
    target: Node = document.documentElement,
): (() => void) => {
    let queued = false;

    const flush = (): void => {
        queued = false;
        callback();
    };

    const observer = new MutationObserver(() => {
        if (queued) {
            return;
        }
        queued = true;
        requestAnimationFrame(flush);
    });

    observer.observe(target, { childList: true, subtree: true });
    callback();

    return () => observer.disconnect();
};

/** The page, without the fragment: what a mount actually depends on. */
const pageOf = (href: string): string => href.split("#")[0] ?? href;

/**
 * Polls `location.href`; an isolated world gets no other SPA signal.
 *
 * Hash-only changes are not navigations. Treating one as a navigation
 * remounted the tree under whatever had just set it, which unsubscribed
 * every queued task the album table was still listening for.
 *
 * @param intervalMs How often to poll, in milliseconds.
 * @returns A function that stops watching.
 */
export const observeLocation = (
    callback: (href: string) => void,
    intervalMs = 400,
): (() => void) => {
    let previous = pageOf(location.href);

    const check = (): void => {
        const next = pageOf(location.href);

        if (next === previous) {
            return;
        }
        previous = next;
        callback(location.href);
    };

    const timer = setInterval(check, intervalMs);
    addEventListener("popstate", check);

    return () => {
        clearInterval(timer);
        removeEventListener("popstate", check);
    };
};

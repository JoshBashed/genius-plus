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

/**
 * Polls `location.href`; an isolated world gets no other SPA signal.
 * @param intervalMs How often to poll, in milliseconds.
 * @returns A function that stops watching.
 */
export const observeLocation = (
    callback: (href: string) => void,
    intervalMs = 400,
): (() => void) => {
    let previous = location.href;

    const check = (): void => {
        if (location.href === previous) {
            return;
        }
        previous = location.href;
        callback(previous);
    };

    const timer = setInterval(check, intervalMs);
    addEventListener("popstate", check);

    return () => {
        clearInterval(timer);
        removeEventListener("popstate", check);
    };
};

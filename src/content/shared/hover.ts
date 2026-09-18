import { createStore, type Store } from "@/utilities/store";
import type { ArtworkTarget } from "@/utilities/types";

/** The artwork under the pointer, plus where it currently sits. */
export interface HoverTarget extends ArtworkTarget {
    readonly element: HTMLElement;
    readonly rect: DOMRect;
}

/** What one site has to tell the shared hover tracker. */
export interface ArtworkSite {
    /** Namespaces the overlay host so sites cannot evict each other. */
    readonly id: string;
    /** Elements that count as album artwork on this site. */
    readonly selectors: readonly string[];
    /** Turns a matched element into download candidates, or `null`. */
    readonly describe: (element: HTMLElement) => ArtworkTarget | null;
}

/** A live hover subscription and the handle that ends it. */
export interface ArtworkHover {
    readonly store: Store<HoverTarget | null>;
    readonly stop: () => void;
}

/** How far the pointer may stray before the button is dismissed. */
const EXIT_MARGIN = 16;

const sameRect = (a: DOMRect, b: DOMRect): boolean =>
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height;

/** Composed path, so artwork inside a shadow root is still found. */
const matchFromEvent = (
    event: Event,
    selectors: readonly string[],
): HTMLElement | null => {
    if (selectors.length === 0) {
        return null;
    }

    const selector = selectors.join(",");

    for (const node of event.composedPath()) {
        if (node instanceof HTMLElement && node.matches(selector)) {
            return node;
        }
    }

    return null;
};

/**
 * Tracks the artwork under the pointer, following it as the page moves.
 * @returns A store holding the current target, and a `stop` to detach.
 */
export const createArtworkHover = (site: ArtworkSite): ArtworkHover => {
    const store = createStore<HoverTarget | null>(null);
    let frame = 0;

    const tick = (): void => {
        const target = store.getSnapshot();

        if (target === null) {
            frame = 0;
            return;
        }

        if (!target.element.isConnected) {
            store.set(null);
            frame = 0;
            return;
        }

        const rect = target.element.getBoundingClientRect();

        if (rect.width === 0 || rect.height === 0) {
            store.set(null);
            frame = 0;
            return;
        }

        if (!sameRect(rect, target.rect)) {
            store.set({ ...target, rect });
        }

        frame = requestAnimationFrame(tick);
    };

    const startTicking = (): void => {
        if (frame === 0) {
            frame = requestAnimationFrame(tick);
        }
    };

    const onPointerOver = (event: PointerEvent): void => {
        const element = matchFromEvent(event, site.selectors);

        if (element === null || store.getSnapshot()?.element === element) {
            return;
        }

        const described = site.describe(element);

        if (described === null || described.candidates.length === 0) {
            return;
        }

        store.set({
            ...described,
            element,
            rect: element.getBoundingClientRect(),
        });
        startTicking();
    };

    const onPointerMove = (event: PointerEvent): void => {
        const target = store.getSnapshot();

        if (target === null) {
            return;
        }

        const { rect } = target;
        const inside =
            event.clientX >= rect.left - EXIT_MARGIN &&
            event.clientX <= rect.right + EXIT_MARGIN &&
            event.clientY >= rect.top - EXIT_MARGIN &&
            event.clientY <= rect.bottom + EXIT_MARGIN;

        if (!inside) {
            store.set(null);
        }
    };

    document.addEventListener("pointerover", onPointerOver, {
        capture: true,
        passive: true,
    });
    document.addEventListener("pointermove", onPointerMove, {
        capture: true,
        passive: true,
    });

    return {
        stop: () => {
            document.removeEventListener("pointerover", onPointerOver, {
                capture: true,
            });
            document.removeEventListener("pointermove", onPointerMove, {
                capture: true,
            });
            cancelAnimationFrame(frame);
            frame = 0;
            store.set(null);
        },
        store,
    };
};

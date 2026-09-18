/** Artwork arrives four ways: `<img>`, `srcset`, background, shadow DOM. */

const BACKGROUND_URL = /url\(["']?(.*?)["']?\)/;

const fromImage = (image: HTMLImageElement): string | null => {
    const url = image.currentSrc || image.src;
    return url === "" ? null : url;
};

/** Picks the highest density entry a `srcset` offers. */
const fromSrcset = (srcset: string): string | null => {
    const entries = srcset
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "")
        .map((entry) => {
            const [url = "", descriptor = ""] = entry.split(/\s+/);
            const width = Number.parseInt(descriptor, 10);
            return { url, weight: Number.isNaN(width) ? 0 : width };
        });

    if (entries.length === 0) {
        return null;
    }

    return entries.reduce((best, entry) =>
        entry.weight > best.weight ? entry : best,
    ).url;
};

const fromBackground = (element: Element): string | null => {
    const image = getComputedStyle(element).backgroundImage;
    const match = BACKGROUND_URL.exec(image);
    return match?.[1] ?? null;
};

/** Searches an element's light DOM and, if present, its shadow root. */
const queryDeep = <T extends Element>(
    root: HTMLElement,
    selector: string,
): T | null =>
    root.querySelector<T>(selector) ??
    root.shadowRoot?.querySelector<T>(selector) ??
    null;

/**
 * Reads the artwork URL off an element however the site supplies it.
 * @returns The best URL found, or `null` when the element has none.
 */
export const findImageUrl = (element: HTMLElement): string | null => {
    if (element instanceof HTMLImageElement) {
        return fromImage(element);
    }

    const image = queryDeep<HTMLImageElement>(element, "img");

    if (image !== null) {
        const url = fromImage(image);
        if (url !== null) {
            return url;
        }
    }

    const source = queryDeep<HTMLSourceElement>(element, "source[srcset]");

    if (source !== null) {
        const url = fromSrcset(source.srcset);
        if (url !== null) {
            return url;
        }
    }

    return fromBackground(element);
};

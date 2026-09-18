import { appleMusicCandidates } from "@/utilities/artwork";
import { log } from "@/utilities/log";
import type { ArtworkTarget } from "@/utilities/types";
import { startArtworkDownloads } from "../shared/artworkFeature";
import { findImageUrl } from "../shared/imageSource";
import { joinLabel, nearestText, pageTitle } from "../shared/labels";

/** Apple Music renders artwork inside web components' shadow roots. */
const ARTWORK_SELECTORS = [
    ".artwork-component",
    "amp-artwork",
    ".container-detail-header__artwork",
    ".product-lockup__artwork",
];

const TITLE_SELECTORS = [
    ".headings__title",
    "[data-testid='non-editable-product-title']",
    ".product-lockup__title",
    ".song-name",
];

const ARTIST_SELECTORS = [
    ".headings__subtitles",
    "[data-testid='click-action']",
    ".product-lockup__subtitle",
    ".artist-name",
];

const TITLE_NOISE = [/\s*[-–—]\s*Apple Music\s*$/i, /\s+on Apple Music\s*$/i];

const describe = (element: HTMLElement): ArtworkTarget | null => {
    const url = findImageUrl(element);

    if (url === null || !url.includes("mzstatic.com")) {
        return null;
    }

    return {
        candidates: appleMusicCandidates(url),
        name: joinLabel(
            nearestText(element, ARTIST_SELECTORS),
            nearestText(element, TITLE_SELECTORS),
            pageTitle(TITLE_NOISE),
        ),
    };
};

startArtworkDownloads({
    describe,
    id: "apple-music",
    selectors: ARTWORK_SELECTORS,
});

log.debug("apple music: artwork downloads active");

import { startArtworkDownloads } from "@/content/shared/artworkFeature";
import { findImageUrl } from "@/content/shared/imageSource";
import { joinLabel, nearestText, pageTitle } from "@/content/shared/labels";
import { startCleanLinks } from "@/content/soundcloud/cleanLinks";
import { soundcloudCandidates } from "@/utilities/artwork";
import { log } from "@/utilities/log";
import type { ArtworkTarget } from "@/utilities/types";

/** SoundCloud paints artwork as a background image on a `span`. */
const ARTWORK_SELECTORS = [
    "span.sc-artwork",
    ".image__full",
    ".fullHero__artwork",
    ".sound__coverArt",
];

const TITLE_SELECTORS = [
    ".soundTitle__title",
    ".fullHero__title",
    ".playbackSoundBadge__titleLink",
];

const ARTIST_SELECTORS = [
    ".soundTitle__username",
    ".fullHero__uploader",
    ".playbackSoundBadge__lightLink",
];

const TITLE_NOISE = [/\s*\|\s*Free Listening on SoundCloud\s*$/i];

const describe = (element: HTMLElement): ArtworkTarget | null => {
    const url = findImageUrl(element);

    if (url === null || !url.includes("sndcdn.com")) {
        return null;
    }

    return {
        candidates: soundcloudCandidates(url),
        name: joinLabel(
            nearestText(element, ARTIST_SELECTORS),
            nearestText(element, TITLE_SELECTORS),
            pageTitle(TITLE_NOISE),
        ),
    };
};

startCleanLinks();
startArtworkDownloads({
    describe,
    id: "soundcloud",
    selectors: ARTWORK_SELECTORS,
});

log.debug("soundcloud: clean links and artwork downloads active");

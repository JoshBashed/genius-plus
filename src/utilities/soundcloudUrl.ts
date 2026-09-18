/** Strips SoundCloud's decorative `?si=`, `utm_*`, and `?in=` params. */

/** Hosts whose query strings are pure decoration. */
const CLEANABLE_HOSTS = new Set([
    "soundcloud.com",
    "www.soundcloud.com",
    "m.soundcloud.com",
    "on.soundcloud.com",
]);

/** `secret_token` is what makes a private track reachable at all. */
const KEEP_PARAMS = new Set(["secret_token"]);

const URL_PATTERN =
    /https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/[^\s<>"'`]+/gi;

/** Trailing characters that are almost always prose, not URL. */
const TRAILING_JUNK = /[.,;:!?)\]}]+$/;

/**
 * Whether `raw` is a SoundCloud URL worth cleaning.
 * @returns `false` for anything unparseable or off-site.
 */
export const isCleanableSoundcloudUrl = (raw: string): boolean => {
    try {
        return CLEANABLE_HOSTS.has(new URL(raw).host.toLowerCase());
    } catch {
        return false;
    }
};

/**
 * Strips decorative params; anything else is returned untouched.
 * @returns The URL keeping only `secret_token`, plus its `#t=` timestamp.
 */
export const cleanSoundcloudUrl = (raw: string): string => {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return raw;
    }

    if (!CLEANABLE_HOSTS.has(url.host.toLowerCase())) {
        return raw;
    }

    for (const key of [...url.searchParams.keys()]) {
        if (!KEEP_PARAMS.has(key)) {
            url.searchParams.delete(key);
        }
    }

    // The hash is where SoundCloud puts a timestamp (`#t=25:51`), so it stays.

    // `URL` keeps a bare "?" around once every param is gone.
    return url.toString().replace(/\?$/, "");
};

/**
 * Rewrites every SoundCloud URL found inside a blob of text.
 * @returns `text` with each URL cleaned, trailing punctuation kept.
 */
export const cleanSoundcloudUrlsInText = (text: string): string =>
    text.replace(URL_PATTERN, (match) => {
        const junk = TRAILING_JUNK.exec(match)?.[0] ?? "";
        const bare = junk === "" ? match : match.slice(0, -junk.length);
        return cleanSoundcloudUrl(bare) + junk;
    });

/**
 * Cheap guard before rewriting a clipboard payload.
 * @returns `true` when at least one URL would change.
 */
export const needsCleaning = (text: string): boolean =>
    cleanSoundcloudUrlsInText(text) !== text;

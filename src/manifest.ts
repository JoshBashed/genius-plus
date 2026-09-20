/** Host match patterns per site, shared with the content scripts. */
export const SITE_MATCHES = {
    genius: ["https://genius.com/*", "https://*.genius.com/*"],
    soundcloud: ["https://soundcloud.com/*", "https://m.soundcloud.com/*"],
    appleMusic: ["https://music.apple.com/*"],
} as const;

/** The one path the import page claims, on both Genius hosts. */
export const IMPORT_MATCHES = [
    "https://genius.com/new/import",
    "https://*.genius.com/new/import",
] as const;

/** Where the artwork actually lives, for the relay fetch fallback. */
export const IMAGE_CDN_MATCHES = [
    "https://*.mzstatic.com/*",
    "https://*.sndcdn.com/*",
] as const;

/** Apple's catalogue, and the site that ships the token it wants. */
export const CREDITS_MATCHES = [
    "https://music.apple.com/*",
    "https://amp-api.music.apple.com/*",
] as const;

/**
 * Builds the manifest that the rspack plugin emits.
 * @param isDev Marks the build so an unpacked copy is recognisable.
 * @returns A complete MV3 manifest.
 */
export const createManifest = (
    version: string,
    isDev: boolean,
): chrome.runtime.ManifestV3 => {
    return {
        manifest_version: 3,
        name: isDev ? "Genius+ (dev)" : "Genius+",
        version,
        // Names what it writes, not only what it reads: an undisclosed
        // write feature is a listing rejection.
        description:
            "Editor toolkit for Genius: album metadata editor with " +
            "Apple Music import, clean SoundCloud links, and full " +
            "quality PNG artwork.",
        icons: {
            16: "icons/icon-16.png",
            32: "icons/icon-32.png",
            48: "icons/icon-48.png",
            128: "icons/icon-128.png",
        },
        action: {
            default_title: "Genius+",
            default_popup: "popup.html",
            default_icon: {
                16: "icons/icon-16.png",
                32: "icons/icon-32.png",
                128: "icons/icon-128.png",
            },
        },
        background: {
            service_worker: "background.js",
        },
        // `WithHostAccess` rather than the bare API: its rules only run
        // where a host permission already reaches, which is the one
        // header rewrite below `CREDITS_MATCHES`.
        permissions: ["storage", "declarativeNetRequestWithHostAccess"],
        // Static `content_scripts` grant their own injection, so only the
        // CDNs the worker fetches from need a host permission.
        host_permissions: [...IMAGE_CDN_MATCHES, ...CREDITS_MATCHES],
        content_scripts: [
            {
                matches: [...SITE_MATCHES.genius],
                js: ["content/genius.js"],
                run_at: "document_idle",
            },
            {
                // Genius's modules import only from the page's world.
                matches: [...SITE_MATCHES.genius],
                js: ["content/genius-main.js"],
                run_at: "document_idle",
                world: "MAIN",
            },
            {
                matches: [...SITE_MATCHES.soundcloud],
                js: ["content/soundcloud.js"],
                run_at: "document_idle",
            },
            {
                // `navigator.clipboard` is not shared across worlds.
                matches: [...SITE_MATCHES.soundcloud],
                js: ["content/soundcloud-main.js"],
                run_at: "document_start",
                world: "MAIN",
            },
            {
                matches: [...SITE_MATCHES.appleMusic],
                js: ["content/apple-music.js"],
                run_at: "document_idle",
            },
            {
                // Only hides their 404, early enough to beat first paint.
                // The page itself is mounted by the main world half.
                matches: [...IMPORT_MATCHES],
                js: ["content/genius-early.js"],
                run_at: "document_start",
            },
        ],
    };
};

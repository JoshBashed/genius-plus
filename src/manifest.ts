/** Host match patterns per site, shared with the content scripts. */
export const SITE_MATCHES = {
    genius: ["https://genius.com/*", "https://*.genius.com/*"],
    soundcloud: ["https://soundcloud.com/*", "https://m.soundcloud.com/*"],
    appleMusic: ["https://music.apple.com/*"],
} as const;

/** Where the artwork actually lives, for the relay fetch fallback. */
export const IMAGE_CDN_MATCHES = [
    "https://*.mzstatic.com/*",
    "https://*.sndcdn.com/*",
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
        description:
            "Editor tooling for Genius: clean SoundCloud links and " +
            "full quality PNG artwork from Apple Music and SoundCloud.",
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
        permissions: ["storage"],
        // Static `content_scripts` grant their own injection, so only the
        // CDNs the worker fetches from need a host permission.
        host_permissions: [...IMAGE_CDN_MATCHES],
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
        ],
    };
};

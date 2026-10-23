import { Result } from "@resulted/results";
import { z } from "zod";
import { decodeOr } from "@/utilities/decode";

/** Everything the popup can toggle, held in `chrome.storage.sync`. */
export interface Settings {
    /** Rewrite SoundCloud links to drop `?si=`, `utm_*`, and `?in=`. */
    readonly cleanSoundcloudLinks: boolean;
    /** Also strip those params from the address bar as you browse. */
    readonly cleanAddressBar: boolean;
    /** Show the download button when hovering album artwork. */
    readonly artworkDownloads: boolean;
    /** The editable song table on Genius album pages. No popup switch. */
    readonly albumSongTable: boolean;
}

/** What a fresh profile gets, and the fallback when storage fails. */
export const DEFAULT_SETTINGS: Settings = {
    cleanSoundcloudLinks: true,
    cleanAddressBar: false,
    artworkDownloads: true,
    albumSongTable: true,
};

const STORAGE_KEY = "settings";

/** Each setting on its own: one unreadable value falls back alone. */
const storedSchema = z.object({
    albumSongTable: z.boolean().optional().catch(undefined),
    artworkDownloads: z.boolean().optional().catch(undefined),
    cleanAddressBar: z.boolean().optional().catch(undefined),
    cleanSoundcloudLinks: z.boolean().optional().catch(undefined),
});

/**
 * Reads the stored settings, merged over the defaults.
 * @returns `DEFAULT_SETTINGS` when storage is unreadable or unset.
 */
export const readSettings = async (): Promise<Settings> => {
    const stored = await Result.try(chrome.storage.sync.get(STORAGE_KEY));

    if (stored.isErr()) {
        return DEFAULT_SETTINGS;
    }

    const value = decodeOr(storedSchema, stored.value[STORAGE_KEY]);

    // Merge, so a new setting picks up its default on an older shape.
    return {
        albumSongTable:
            value?.albumSongTable ?? DEFAULT_SETTINGS.albumSongTable,
        artworkDownloads:
            value?.artworkDownloads ?? DEFAULT_SETTINGS.artworkDownloads,
        cleanAddressBar:
            value?.cleanAddressBar ?? DEFAULT_SETTINGS.cleanAddressBar,
        cleanSoundcloudLinks:
            value?.cleanSoundcloudLinks ??
            DEFAULT_SETTINGS.cleanSoundcloudLinks,
    };
};

/** The tail of the write chain, so no read-modify-write interleaves. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Merges `patch` into the stored settings, after every earlier write.
 * @returns The settings as they now stand.
 */
export const writeSettings = (patch: Partial<Settings>): Promise<Settings> => {
    const next = queue.then(async () => {
        const merged = { ...(await readSettings()), ...patch };
        await chrome.storage.sync.set({ [STORAGE_KEY]: merged });
        return merged;
    });

    // A rejected tail must not stop every later write from running.
    queue = next.catch(() => undefined);
    return next;
};

/**
 * Calls `listener` whenever the stored settings change.
 * @returns A function that stops listening.
 */
export const watchSettings = (
    listener: (settings: Settings) => void,
): (() => void) => {
    const onChange = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
    ): void => {
        if (area !== "sync" || !(STORAGE_KEY in changes)) {
            return;
        }
        void readSettings().then(listener);
    };

    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
};

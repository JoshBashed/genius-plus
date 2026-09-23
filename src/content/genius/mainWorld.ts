/** Genius, main world: imports the page's modules. No `chrome.*`. */
import { resetBindings } from "@/bindings";
import { observeLocation } from "@/utilities/dom";
import { log } from "@/utilities/log";
import { installEverything } from "./install";
import { albumTableLoader } from "./loaders/albumTable";
import { importPageLoader } from "./loaders/importPage";
import { type Mounted, mountLoaders } from "./loaders/mount";
import { postStatus, readEnabled } from "./relay";

/** Every page this extension puts something on. */
const LOADERS = [albumTableLoader, importPageLoader];

let enabled = false;
let watching: (() => void) | null = null;
let mounted: Mounted | null = null;
let starting: Promise<void> | null = null;

const stop = (): void => {
    mounted?.unmount();
    mounted = null;
};

const start = async (): Promise<void> => {
    stop();
    mounted = await mountLoaders(LOADERS, installEverything);
};

/**
 * Serialised, so a navigation mid-start cannot leave two trees up.
 * The chain is never left rejected: one page this cannot mount must not
 * stop every later navigation from mounting anything.
 */
const restart = (): void => {
    starting = (starting ?? Promise.resolve())
        .then(async () => {
            // A new document has new chunk hashes, so nothing carries.
            resetBindings();
            await start();
        })
        .catch((error: unknown) => {
            log.warn("genius: mount", String(error));
        });
};

const apply = (next: boolean): void => {
    if (next === enabled) {
        return;
    }

    enabled = next;

    if (!next) {
        watching?.();
        watching = null;
        stop();
        postStatus("removed", location.pathname);
        return;
    }

    starting = (starting ?? Promise.resolve())
        .then(start)
        .catch((error: unknown) => {
            log.warn("genius: mount", String(error));
        });

    // Otherwise the previous album's table sits under a new album.
    watching ??= observeLocation(restart);
};

addEventListener("message", (event) => {
    const next = readEnabled(event);

    if (next !== null) {
        apply(next);
    }
});

// The isolated half may have broadcast before this listener existed.
postStatus("ready");

/** Every feature on Genius, mounted wherever the page is one it serves. */
import { resetBindings } from "@/bindings";
import { albumImport } from "@/content/genius/features/albumImport";
import { metadataEditor } from "@/content/genius/features/metadataEditor";
import { type Mounted, mountLoaders } from "@/content/genius/features/mount";
import { installEverything } from "@/content/genius/utilities/install";
import { postStatus, readEnabled } from "@/content/genius/utilities/relay";
import { observeLocation } from "@/utilities/dom";
import { log } from "@/utilities/log";

/** Every feature, each mounting on the pages it serves. */
const FEATURES = [metadataEditor, albumImport];

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
    mounted = await mountLoaders(FEATURES, installEverything);
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

/**
 * Mounts every feature while the isolated half says they are switched
 * on, and follows navigation from then on.
 */
export const initFeatures = (): void => {
    addEventListener("message", (event) => {
        const next = readEnabled(event);

        if (next !== null) {
            apply(next);
        }
    });

    // The isolated half may have broadcast before this listener existed.
    postStatus("ready");
};

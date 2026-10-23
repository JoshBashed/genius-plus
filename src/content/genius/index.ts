/** Genius, isolated world: the half that has `chrome.*`. */

import { IMPORT_PATH } from "@/content/genius/importRoute";
import { watchNav } from "@/content/genius/navSlot";
import {
    postEnabled,
    readStatus,
    serveCreditRequests,
} from "@/content/genius/relay";
import { serveChunkCache } from "@/content/genius/utilities/chunkCache";
import { log } from "@/utilities/log";
import {
    readSettings,
    type Settings,
    watchSettings,
} from "@/utilities/settings";

let current: Settings | null = null;

const publish = (settings: Settings): void => {
    current = settings;
    postEnabled(settings.albumSongTable);
};

addEventListener("message", (event) => {
    const report = readStatus(event);

    if (report === null) {
        return;
    }

    // The main half may start after the first broadcast, hence its hello.
    if (report.status === "ready") {
        if (current !== null) {
            postEnabled(current.albumSongTable);
        }
        return;
    }

    const detail = report.detail === null ? "" : `: ${report.detail}`;

    if (report.status === "failed") {
        log.warn(`genius: album table ${report.status}${detail}`);
        return;
    }

    log.debug(`genius: album table ${report.status}${detail}`);
});

void readSettings().then(publish);
watchSettings(publish);

// Their sticky nav is on every page, so this is the one entry point that
// does not depend on the album table having mounted.
watchNav({ href: IMPORT_PATH, label: "Add An Album" });

// The main half has the page's React but no `chrome.*`, so its reads
// of Apple's catalogue and extension storage are answered here.
serveCreditRequests();
serveChunkCache();

/** Genius, main world: imports the page's modules. No `chrome.*`. */
import { observeLocation } from "@/utilities/dom";
import { restartAlbumTable, startAlbumTable, stopAlbumTable } from "./mount";
import { postStatus, readEnabled } from "./relay";

let enabled = false;
let watching: (() => void) | null = null;

const apply = (next: boolean): void => {
    if (next === enabled) {
        return;
    }

    enabled = next;

    if (!next) {
        watching?.();
        watching = null;
        stopAlbumTable();
        return;
    }

    void startAlbumTable();

    // Otherwise the previous album's table sits under a new album.
    watching ??= observeLocation(() => {
        void restartAlbumTable();
    });
};

addEventListener("message", (event) => {
    const next = readEnabled(event);

    if (next !== null) {
        apply(next);
    }
});

// The isolated half may have broadcast before this listener existed.
postStatus("ready");

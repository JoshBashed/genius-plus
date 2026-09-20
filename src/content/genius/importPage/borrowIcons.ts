/** Their tick lives on song pages, which no page we stand on is. */
import { Result } from "@resulted/results";
import {
    borrowChunks,
    describeBindingError,
    getPage,
    readChunkUrls,
} from "@/bindings";
import { log } from "@/utilities/log";
import { installExtras } from "../reactHost/install";

/** Latched on success only, so a failed borrow can be tried again. */
let taken = false;

/** In flight, so two rows asking at once make one request. */
let asking: Promise<void> | null = null;

/**
 * Borrows whatever a song page carries that this one does not.
 *
 * The 404 the import stands on preloads three icons, and their Add A
 * Song form two more. `check` is on neither, and a song page is the
 * first thing with one that this page can name, which it can only do
 * once the reader has settled on an album.
 *
 * Re-running the optional installs is what fills the slots: a binding
 * memoises a success and retries a failure, so the ones that already
 * bound cost nothing and the ones that could not are tried again.
 */
const borrow = async (songUrl: string): Promise<boolean> => {
    const page = getPage();

    if (page.isErr() || page.value.kind !== "react") {
        return false;
    }

    const response = await Result.try(
        fetch(songUrl, { credentials: "same-origin" }),
    );

    if (response.isErr() || !response.value.ok) {
        log.debug("genius: icons", `could not read ${songUrl}`);
        return false;
    }

    const html = await Result.try(response.value.text());

    if (html.isErr()) {
        return false;
    }

    const shared = borrowChunks(readChunkUrls(html.value), page.value.chunks);

    if (shared.isErr()) {
        log.debug("genius: icons", describeBindingError(shared.error));
        return false;
    }

    await installExtras();
    return true;
};

/**
 * @returns When the borrow has finished, so a caller can render after
 * it rather than before: filling a slot changes a stored value and
 * nothing re-renders on its own.
 */
export const borrowIconsFrom = (songUrl: string): Promise<void> => {
    if (taken) {
        return Promise.resolve();
    }

    asking ??= borrow(songUrl).then((worked) => {
        taken = worked;
        asking = null;
    });

    return asking;
};

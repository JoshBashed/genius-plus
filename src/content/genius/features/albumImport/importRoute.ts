/** The path we take over, shared by the link and the page that claims it. */

/**
 * A path Genius itself answers with a 404.
 *
 * Claiming a real 404 rather than inventing a hash route means the link
 * behaves like any other: it is a plain navigation, so the page that
 * takes it over is loaded fresh with nothing of theirs still running.
 */
export const IMPORT_PATH = "/new/import";

/** Their own 404 body, which the assistant stands in place of. */
export const NOT_FOUND = ".render_404";

/** The rule that hides it until the assistant has something to show. */
export const HIDE_STYLE_ID = "genius-plus-hide-404";

/**
 * The import page, pointed at one album.
 * @param albumId Preselects the album, so the page skips its own search.
 */
export const importUrlFor = (albumId: number): string =>
    `${IMPORT_PATH}?album=${albumId}`;

/**
 * The mark the import leaves on an album URL.
 *
 * The staged edits travel in the draft stash, which the table restores
 * on its own; this only says to open the table rather than wait to be
 * asked, so the user lands on what the import just staged.
 */
export const EDITOR_HASH = "#genius-plus";

/**
 * Takes the mark back off the URL, once the table has been closed.
 *
 * Never while it is opening: replacing the URL under their modal reads
 * as a navigation and closes it. Leaving it until then also means a
 * tree that remounts opens again rather than stranding staged edits.
 */
export const dropEditorHash = (): void => {
    if (location.hash === EDITOR_HASH) {
        history.replaceState(null, "", location.pathname + location.search);
    }
};

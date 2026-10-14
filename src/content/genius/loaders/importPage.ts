/** The album import assistant, on the route Genius answers with a 404. */
import { Result } from "@resulted/results";
import { createElement, type ReactElement } from "react";
import { resetBindings } from "@/bindings";
import { log } from "@/utilities/log";
import { loadGeniusAlbum } from "../importPage/geniusAlbums";
import { HIDE_STYLE_ID, IMPORT_PATH, NOT_FOUND } from "../importRoute";
import type { Loader } from "./mount";

const APP_ID = "application";

/** Their 404, kept aside so a failure can put it back. */
let replaced: Element | null = null;

/** Gives their 404 back, which beats leaving the page blank. */
const restoreNotFound = (): void => {
    const mount = document.getElementById(APP_ID);

    if (replaced !== null && mount?.parentElement != null) {
        mount.parentElement.replaceChild(replaced, mount);
        replaced = null;
    }

    document.getElementById(HIDE_STYLE_ID)?.remove();
};

/**
 * Swaps their 404 for the root a React page needs.
 *
 * `detectPage` calls a page React only when `#application` is there, so
 * this element is what lets every existing binding work on a 404.
 */
const claimRoot = (): HTMLElement => {
    const existing = document.getElementById(APP_ID);

    if (existing !== null) {
        return existing;
    }

    const mount = document.createElement("div");
    mount.id = APP_ID;

    const notFound = document.querySelector(NOT_FOUND);
    const host = notFound?.parentElement ?? null;

    if (notFound !== null && host !== null) {
        replaced = notFound;
        host.replaceChild(mount, notFound);
    } else {
        // Their 404 markup is not load bearing; its absence survivable.
        document.body.append(mount);
    }

    log.debug(
        `genius: import page claimed #${APP_ID}${
            notFound === null ? " (no 404 body to replace)" : ""
        }`,
    );

    return mount;
};

export const importPageLoader: Loader = {
    build: async (): Promise<ReactElement> => {
        // Eager, so it stays in this bundle but evaluates only once the
        // styles under it have a `styled` to build with.
        const { ImportAssistant } = await import(
            /* webpackMode: "eager" */ "../importPage"
        );

        const named = new URLSearchParams(location.search).get("album");
        const albumId = named === null ? Number.NaN : Number(named);
        const album = Number.isFinite(albumId)
            ? await loadGeniusAlbum(albumId)
            : null;

        return createElement(ImportAssistant, {
            album: album?.isOk() === true ? album.value : null,
        });
    },

    cleanUp: restoreNotFound,

    matches: (): boolean => location.pathname === IMPORT_PATH,

    name: "import page",

    // Nothing here can fail: a 404 body it cannot find is survivable.
    prepare: async (): Promise<Result<Element | null, never>> => {
        const root = claimRoot();

        document.title = "Album Import | Genius+";
        // Something to look at while the chunks load, cleared on render.
        root.textContent = "Loading the import assistant…";

        // Whatever ran before that element existed read this as the
        // legacy page and cached it, and `getPage` only ever caches once.
        resetBindings();
        root.textContent = "";

        return Result.ok(root);
    },
};

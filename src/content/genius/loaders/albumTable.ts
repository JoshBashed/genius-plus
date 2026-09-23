/** The metadata editor, on a React album page. */
import { Result } from "@resulted/results";
import { createElement, type ReactElement } from "react";
import { describeMarkers, getPage } from "@/bindings";
import { loadPrimaryTagOptions } from "../options";
import { describePageError, isAlbumUrl, readAlbumSeed } from "../pageState";
import { postStatus } from "../relay";
import { legacyNotice } from "./legacyNotice";
import type { Loader, PrepareFailure } from "./mount";

const CONTAINER_ID = "genius-plus-album-table";

/** Beside their app root, never inside a tree React already owns. */
const claimContainer = (): HTMLElement => {
    const existing = document.getElementById(CONTAINER_ID);

    if (existing instanceof HTMLElement) {
        existing.replaceChildren();
        return existing;
    }

    const created = document.createElement("div");
    created.id = CONTAINER_ID;

    const application = document.querySelector("#application");

    if (application?.parentNode != null) {
        application.parentNode.insertBefore(created, application.nextSibling);
    } else {
        document.body.append(created);
    }

    return created;
};

export const albumTableLoader: Loader = {
    build: async (): Promise<ReactElement> => {
        const seed = readAlbumSeed();

        // `prepare` already read it; this cannot be the failing one.
        if (seed.isErr()) {
            throw new Error("the album seed went away after it was read");
        }

        // Eager, so it stays in this bundle but evaluates only once the
        // styles under it have a `styled` to build with.
        const { SongTable } = await import(
            /* webpackMode: "eager" */ "../songTable"
        );

        postStatus("rendered", `${seed.value.tracks.length} songs`);

        return createElement(SongTable, {
            album: seed.value,
            primaryTagOptions: await loadPrimaryTagOptions(),
        });
    },

    cleanUp: (): void => {
        document.getElementById(CONTAINER_ID)?.remove();
    },

    matches: isAlbumUrl,

    name: "album table",

    prepare: async (): Promise<Result<Element | null, PrepareFailure>> => {
        const page = getPage();

        if (page.isErr()) {
            return Result.err({
                kind: "notPrepared",
                reason: page.error.reason,
            });
        }

        // Their A/B legacy page has no React tree to borrow from, so it
        // gets a notice instead of a table, and nothing is rendered.
        if (page.value.kind === "legacy") {
            legacyNotice(claimContainer());
            postStatus("legacy", describeMarkers(page.value.markers));
            return Result.ok(null);
        }

        const seed = readAlbumSeed();

        if (seed.isErr()) {
            postStatus("failed", seed.error.kind);
            return Result.err({
                kind: "notPrepared",
                reason: describePageError(seed.error),
            });
        }

        return Result.ok(claimContainer());
    },
};

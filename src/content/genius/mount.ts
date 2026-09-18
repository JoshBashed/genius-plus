/** Mounts the table beside `#application`, never inside their tree. */
import {
    describeMarkers,
    detectPage,
    type PageRoot,
    resetBindings,
} from "@/bindings";
import { type AppError, describeError } from "@/utilities/result";
import { loadPrimaryTagOptions } from "./options";
import { withPageContexts } from "./pageContext";
import { isAlbumUrl, readAlbumSeed } from "./pageState";
import {
    installComponents,
    installExtras,
    installRuntime,
} from "./reactHost/install";
import { createElement } from "./reactHost/react";
import { postStatus } from "./relay";

const CONTAINER_ID = "genius-plus-album-table";

let root: PageRoot | null = null;
let container: HTMLElement | null = null;
let running = false;

/** Bumped by every stop, so a run that lost its document cannot commit. */
let generation = 0;

const ensureContainer = (): HTMLElement => {
    const existing = container ?? document.getElementById(CONTAINER_ID);

    if (existing instanceof HTMLElement) {
        existing.replaceChildren();
        container = existing;
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

    container = created;
    return created;
};

export const stopAlbumTable = (): void => {
    generation += 1;
    root?.unmount();
    root = null;
    container?.remove();
    container = null;
    running = false;
};

const renderLegacyNotice = (): void => {
    const host = ensureContainer();
    const notice = document.createElement("div");

    notice.setAttribute(
        "style",
        [
            "position: fixed;",
            "z-index: 9999;",
            "top: 0.5rem;",
            "right: 0.5rem;",
            "padding: 1rem;",
            "background: #f0f0f0;",
            "border: 1px solid #000;",
            "box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.25);",
            "display: flex;",
            "gap: 1rem;",
            "align-items: flex-start;",
        ].join(""),
    );

    const info = document.createElement("div");
    info.setAttribute(
        "style",
        ["display: flex;", "flex-direction: column;", "gap: 0.25rem;"].join(""),
    );

    const heading = document.createElement("strong");
    heading.textContent = "Genius+ not available";

    const body = document.createElement("span");
    body.textContent = "Legacy album page does not use React.";

    info.append(heading, body);

    const close = document.createElement("button");
    close.textContent = "×";
    close.setAttribute(
        "style",
        [
            "background: none;",
            "border: none;",
            "width: 1rem;",
            "height: 1rem;",
            "font-size: 1.5rem;",
            "line-height: 1rem;",
            "cursor: pointer;",
        ].join(""),
    );
    close.addEventListener("click", () => {
        notice.remove();
    });

    notice.append(info, close);

    host.append(notice);
};

const fail = (error: AppError): void => {
    postStatus("failed", describeError(error));
};

/**
 * One start attempt, so `startAlbumTable` alone owns the `running` flag.
 * @param era The generation this run began in; a stop makes it stale.
 * @returns Whether the run left something mounted.
 */
const buildAlbumTable = async (era: number): Promise<boolean> => {
    if (!isAlbumUrl()) {
        postStatus("skipped", `${location.pathname} is not an album page`);
        return false;
    }

    const page = detectPage();

    if (page.isErr()) {
        fail(page.error);
        return false;
    }

    if (page.value.kind === "legacy") {
        renderLegacyNotice();
        postStatus("legacy", describeMarkers(page.value.markers));
        return true;
    }

    const seed = readAlbumSeed();

    if (seed.isErr()) {
        fail(seed.error);
        return false;
    }

    const runtime = await installRuntime();

    if (runtime.isErr()) {
        fail(runtime.error);
        return false;
    }

    const components = await installComponents([
        "button",
        "dateInput",
        "selectInput",
        "smallButton",
        "spinner",
        "tagInput",
        "textInput",
    ]);

    if (components.isErr()) {
        fail(components.error);
        return false;
    }

    await installExtras();

    const primaryTagOptions = await loadPrimaryTagOptions();

    // A restart while those loaded: these are the old document's chunks.
    if (era !== generation) {
        return false;
    }

    // Eager, so it stays in this bundle but evaluates only once the
    // styles module below it has a `styled` to build with.
    const { SongTable } = await import(
        /* webpackMode: "eager" */ "./songTable"
    );

    if (era !== generation) {
        return false;
    }

    const tree = withPageContexts(
        runtime.value.contexts,
        // Belt and braces, in case the walk missed their provider.
        createElement(
            runtime.value.styled.ThemeProvider,
            { theme: runtime.value.theme },
            createElement(SongTable, {
                album: seed.value,
                primaryTagOptions,
            }),
        ),
    );

    root = runtime.value.dom.createRoot(ensureContainer());
    root.render(tree);
    postStatus("rendered", `${seed.value.tracks.length} songs`);
    return true;
};

/** Safe to call twice; a second call is a no-op until stopped. */
export const startAlbumTable = async (): Promise<void> => {
    if (running) {
        return;
    }

    running = true;
    const era = generation;
    const mounted = await buildAlbumTable(era);

    // A restart owns the flag now, so this run must not touch it.
    if (era === generation) {
        running = mounted;
    }
};

/** Rebuilds everything: a new document has new chunk hashes. */
export const restartAlbumTable = async (): Promise<void> => {
    stopAlbumTable();
    resetBindings();
    postStatus("removed", location.pathname);
    await startAlbumTable();
};

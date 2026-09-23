/** Mounting, in general. Nothing here knows what a page of ours contains. */
import type { Result } from "@resulted/results";
import {
    type ChunkError,
    describeBindingError,
    type PageElement,
} from "@/bindings";
import { log } from "@/utilities/log";
import type { Runtime } from "../install";
import { renderTree } from "./renderTree";

/**
 * Why a loader took no place on the page.
 *
 * Flat by design: a loader's own failures are its business, so what
 * reaches here is the line it wants logged and nothing else.
 */
export interface PrepareFailure {
    readonly kind: "notPrepared";
    /** Already a sentence, because it is the only thing logged. */
    readonly reason: string;
}

/**
 * One thing this extension puts on a Genius page.
 *
 * A loader answers two questions and does no binding of its own: whether
 * this page is one it has anything to do with, and where it wants to
 * render. Everything borrowed is installed once, before any of them
 * builds, so a loader only ever touches the document and its own tree.
 */
export interface Loader {
    /** Named in the log line, and nowhere else. */
    readonly name: string;
    /** Whether this page is one it belongs on at all. */
    readonly matches: () => boolean;
    /**
     * Its work on the document, before anything is bound: claiming a
     * container, standing in for a page, finding a slot in their own UI.
     *
     * @returns Where to render, or `null` to take the page and render
     * nothing into it, which is what a warning notice does.
     */
    readonly prepare: () => Promise<Result<Element | null, PrepareFailure>>;
    /** Its tree, built once the bindings behind it are installed. */
    readonly build: (runtime: Runtime) => Promise<PageElement>;
    /** Undoes `prepare`; the rendered tree is unmounted for it. */
    readonly cleanUp?: () => void;
}

export interface Mounted {
    readonly unmount: () => void;
}

/**
 * Runs every loader that claims this page.
 *
 * @param install Fills the slots, once, between the loaders' document
 * work and their trees; a chunk is only findable after `prepare`, and a
 * tree can only be built after the install.
 */
export const mountLoaders = async (
    loaders: readonly Loader[],
    install: () => Promise<Result<Runtime, ChunkError>>,
): Promise<Mounted> => {
    const claimed = loaders.filter((loader) => loader.matches());
    const undo: (() => void)[] = [];

    if (claimed.length === 0) {
        return { unmount: () => {} };
    }

    const prepared = await Promise.all(
        claimed.map(async (loader) => ({
            loader,
            where: await loader.prepare(),
        })),
    );

    for (const { loader, where } of prepared) {
        if (where.isErr()) {
            log.warn(`genius: ${loader.name}`, where.error.reason);
        } else if (loader.cleanUp !== undefined) {
            undo.push(loader.cleanUp);
        }
    }

    const installed = await install();

    if (installed.isErr()) {
        log.warn("genius: bindings", describeBindingError(installed.error));

        for (const stop of undo) {
            stop();
        }

        return { unmount: () => {} };
    }

    for (const { loader, where } of prepared) {
        if (where.isErr() || where.value === null) {
            continue;
        }

        const mounted = await renderTree(
            where.value,
            installed.value,
            loader.build,
        );

        undo.push(mounted.unmount);
        log.debug(`genius: ${loader.name} mounted`);
    }

    return {
        unmount: (): void => {
            for (const stop of undo.reverse()) {
                stop();
            }
        },
    };
};

/** Rendering into the page's React: the part no page owns on its own. */

import { createElement } from "react";
import type { PageElement, PageRoot } from "@/bindings";
import type { Runtime } from "../install";
import { withPageContexts } from "../pageContext";

export interface MountedTree {
    readonly unmount: () => void;
}

/**
 * What a page renders, built once its bindings are installed.
 *
 * A page cannot build its element up front: its own components are not
 * bound until the runtime is, and a styles module cannot evaluate before
 * `styled` exists. So it hands back a builder instead of a tree.
 */
export type BuildTree = (runtime: Runtime) => Promise<PageElement>;

/**
 * Renders a page's tree under the providers its own React is running.
 *
 * Every tree goes up under the providers the page's own React is already
 * running, plus its `ThemeProvider`, so a borrowed component finds the
 * context it expects however deeply it looks.
 *
 * @param container Where the root is created; the caller owns it.
 * @returns A handle that unmounts it again.
 */
export const renderTree = async (
    container: Element,
    runtime: Runtime,
    build: BuildTree,
): Promise<MountedTree> => {
    const element = await build(runtime);
    const tree = withPageContexts(
        runtime.contexts,
        // Belt and braces, in case the walk missed their provider.
        createElement(
            runtime.styled.ThemeProvider,
            { theme: runtime.theme },
            element,
        ),
    );

    const root: PageRoot = runtime.dom.createRoot(container);

    root.render(tree);

    return {
        unmount: (): void => {
            root.unmount();
        },
    };
};

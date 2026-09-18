import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";

/** `@property` rules are ignored in a shadow root, so hoist them out. */
const PROPERTY_RULE = /@property\s+--[\w-]+\s*\{[^}]*\}/g;

const PROPERTY_STYLE_ID = "genius-plus-tw-properties";

const hoistPropertyRules = (css: string): string => {
    const rules = css.match(PROPERTY_RULE);

    if (rules === null) {
        return css;
    }

    if (document.getElementById(PROPERTY_STYLE_ID) === null) {
        const style = document.createElement("style");
        style.id = PROPERTY_STYLE_ID;
        style.textContent = rules.join("\n");
        document.head.appendChild(style);
    }

    return css.replace(PROPERTY_RULE, "");
};

/**
 * Renders into a shadow root on a fixed, click-through host.
 * @param id Host element id; an existing host with it is replaced.
 * @param css Injected into the shadow root as one `<style>`.
 * @returns A function that unmounts and removes the host.
 */
export const mountOverlay = (
    id: string,
    css: string,
    node: ReactNode,
): (() => void) => {
    const existing = document.getElementById(id);
    existing?.remove();

    const host = document.createElement("div");
    host.id = id;
    host.style.cssText = [
        "all:initial",
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "pointer-events:none",
    ].join(";");

    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = hoistPropertyRules(css);
    shadow.appendChild(style);

    // `all:initial` outranks Tailwind's `:host` font rule; ask again.
    const container = document.createElement("div");
    container.className = "font-sans";
    shadow.appendChild(container);

    const root = createRoot(container);
    root.render(node);

    return () => {
        root.unmount();
        host.remove();
    };
};

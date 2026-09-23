/** The header menu that stages one value across a whole column. */

import { useEffect, useRef } from "react";
import type { PageElement, PageNode } from "@/bindings";
import { FIELD_LABELS } from "../draft";
import { Dropdown, hasDropdown } from "../geniusComponents";
import type { ColumnSpec } from "./columns";
import { MenuPanel } from "./styles";

/** Genius ships no ellipsis, so the trigger draws its own three dots. */
const Ellipsis = (): PageElement => (
    <svg
        aria-hidden="true"
        focusable="false"
        height="14"
        viewBox="0 0 16 16"
        width="14"
        xmlns="http://www.w3.org/2000/svg"
    >
        <circle cx="3" cy="8" fill="currentColor" r="1.4" />
        <circle cx="8" cy="8" fill="currentColor" r="1.4" />
        <circle cx="13" cy="8" fill="currentColor" r="1.4" />
    </svg>
);

/**
 * Their `Dropdown` portals the panel to `<body>` as a fixed element with no
 * z-index, and a fixed element is its own stacking context, so the panel
 * lands under the modal (`modalLower`, 8). Raising their wrapper to their
 * own `portalTooltip` layer is the only way out from in here.
 */
const ABOVE_MODAL = "11";

interface PanelProps {
    readonly children: PageNode;
}

const Panel = ({ children }: PanelProps): PageElement => {
    const panel = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = panel.current?.parentElement ?? null;

        if (host !== null) {
            host.style.zIndex = ABOVE_MODAL;
        }
    }, []);

    // `display: contents` keeps this out of layout; it exists only to
    // hand the effect a reference to their portal wrapper.
    return (
        <div ref={panel} style={{ display: "contents" }}>
            <MenuPanel>{children}</MenuPanel>
        </div>
    );
};

/** Which rows a pick reaches: the empty ones, or every one of them. */
export type FillMode = "empty" | "all";

export interface ColumnMenuProps {
    readonly column: ColumnSpec;
    readonly onPick: (mode: FillMode) => void;
}

export const ColumnMenu = ({
    column,
    onPick,
}: ColumnMenuProps): PageElement => {
    if (!hasDropdown()) {
        return <span hidden />;
    }

    const label = FIELD_LABELS[column.field];

    return (
        <Dropdown
            portal
            renderToggle={({ onClick }) => (
                <button
                    aria-label={`${label} column actions`}
                    className="gp-menu"
                    onClick={onClick}
                    title={`${label} column actions`}
                    type="button"
                >
                    <Ellipsis />
                </button>
            )}
        >
            {({ onClose }) => (
                <Panel>
                    <button
                        onClick={() => {
                            onClose();
                            onPick("empty");
                        }}
                        type="button"
                    >
                        Fill empty
                    </button>
                    <button
                        onClick={() => {
                            onClose();
                            onPick("all");
                        }}
                        type="button"
                    >
                        Replace all
                    </button>
                </Panel>
            )}
        </Dropdown>
    );
};

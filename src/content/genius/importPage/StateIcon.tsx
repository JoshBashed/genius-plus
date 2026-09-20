/** What an import will do to one row, as a mark rather than a sentence. */
import { asPageValue, type PageComponent, type PageElement } from "@/bindings";
import { memo } from "../reactHost/react";

/** What the icon says, and what a reader hears instead of seeing it. */
export type RowState = "new" | "kept" | "missing";

const LABELS: Readonly<Record<RowState, string>> = {
    kept: "Already on the album",
    missing: "Nothing chosen yet",
    new: "Will be created",
};

/** Their own stroke weight, so these sit beside Genius's own icons. */
const STROKE = 1.6;

const PATHS: Readonly<Record<RowState, PageElement>> = {
    // Two arrows round a circle: this row reuses a song Genius has.
    kept: (
        <>
            <path d="M13.5 3.5a5.5 5.5 0 0 0-5.2 3.7" />
            <path d="M2.5 8.5a5.5 5.5 0 0 0 5.2 3.7" />
            <path d="M12.8 2.2v2.6h-2.6" />
            <path d="M3.2 13.8v-2.6h2.6" />
        </>
    ),
    // An exclamation, because this row would be skipped as it stands.
    missing: (
        <>
            <path d="M8 4.5v4.2" />
            <path d="M8 11.4v.1" />
            <circle cx="8" cy="8" r="6" />
        </>
    ),
    // A plus: this row becomes a song the album does not have yet.
    new: (
        <>
            <path d="M8 3.5v9" />
            <path d="M3.5 8h9" />
        </>
    ),
};

export interface StateIconProps {
    readonly state: RowState;
}

/**
 * One row's outcome.
 * Labelled rather than titled, so the meaning survives for a reader who
 * never sees the shape.
 */
const renderStateIcon = ({ state }: StateIconProps): PageElement => (
    <svg
        aria-label={LABELS[state]}
        className={`gp-icon gp-icon-${state}`}
        fill="none"
        height="16"
        role="img"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={STROKE}
        viewBox="0 0 16 16"
        width="16"
    >
        {PATHS[state]}
    </svg>
);

export const StateIcon = memo(
    asPageValue<PageComponent<StateIconProps>>(renderStateIcon),
);

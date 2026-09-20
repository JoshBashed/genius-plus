// Spacing here is flex or grid `gap`, never a margin. The only `margin`
// allowed is a zero that neutralises a default someone else set.
/** The assistant's styled parts. Every theme read happens at render time. */
import {
    asPageValue,
    type PageComponent,
    type PageNode,
    type PageStyledValue,
} from "@/bindings";
// Deep imports, not the barrel: it evaluates every component, and
// this page binds only the few it renders with.
import { styled } from "../geniusComponents/styled";

type Wrapper = PageComponent<{ readonly children?: PageNode }>;

const softBorder: PageStyledValue = ({ theme }) =>
    `color-mix(in srgb, ${theme.color.border.adaptive} 40%, transparent)`;

/**
 * The page itself, centred in the column Genius's own pages use.
 * One grid track of at most `48rem` does the centring, because spacing
 * here is never a margin.
 */
export const Page = asPageValue<Wrapper>(
    styled("main")`
        display: grid;
        grid-template-columns: minmax(0, 48rem);
        justify-content: center;
        gap: ${({ theme }) => theme.space.large};
        padding: ${({ theme }) => theme.space.xxLarge}
            ${({ theme }) => theme.space.large};
        font-family: ${({ theme }) => theme.font.reading};
        color: ${({ theme }) => theme.color.background.on};

        h1 {
            margin: 0;
            font-family: ${({ theme }) => theme.font.heading ?? theme.font.reading};
            font-size: ${({ theme }) => theme.fontSize.smallHeadline};
            font-weight: ${({ theme }) => theme.fontWeight.bold ?? theme.fontWeight.normal};
        }

        h2 {
            margin: 0;
            font-size: ${({ theme }) => theme.fontSize.smallHeadline};
            font-weight: ${({ theme }) => theme.fontWeight.normal};
        }

        p {
            margin: 0;
            color: ${({ theme }) => theme.color.background.onVariant};
            font-size: ${({ theme }) => theme.fontSize.reading};
            line-height: ${({ theme }) => theme.lineHeight.reading};
        }
    `,
);

/** The stepped progress bar: one segment per step, filled as it passes. */
export const Steps = asPageValue<Wrapper>(
    styled("ol")`
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: ${({ theme }) => theme.space.half};
        margin: 0;
        padding: 0;
        list-style: none;

        li {
            display: flex;
            flex-direction: column;
            gap: ${({ theme }) => theme.space.quarter};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
            color: ${({ theme }) => theme.color.background.onVariant};
        }

        li::before {
            content: "";
            height: 3px;
            border-radius: 999px;
            background: ${softBorder};
        }

        li[data-state="done"],
        li[data-state="active"] {
            color: ${({ theme }) => theme.color.background.on};
        }

        li[data-state="done"]::before,
        li[data-state="active"]::before {
            background: ${({ theme }) => theme.color.accent.main};
        }
    `,
);

/** One step's panel. */
export const Panel = asPageValue<Wrapper>(
    styled("section")`
        display: flex;
        flex-direction: column;
        gap: ${({ theme }) => theme.space.large};

        /** One labelled control of a step's form. */
        .gp-row {
            display: flex;
            flex-direction: column;
            gap: ${({ theme }) => theme.space.quarter};
        }

        .gp-label {
            color: ${({ theme }) => theme.color.background.onVariant};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
        }
    `,
);

/** The artwork beside the album's names, as the mock has it. */
export const Media = asPageValue<Wrapper>(
    styled("div")`
        display: flex;
        align-items: center;
        gap: ${({ theme }) => theme.space.large};

        img {
            width: 7.5rem;
            height: 7.5rem;
            object-fit: cover;
            background: ${softBorder};
        }

        .gp-names {
            display: flex;
            flex-direction: column;
            gap: ${({ theme }) => theme.space.quarter};
            min-width: 0;
            flex: 1 1 auto;
        }

        .gp-title {
            font-family: ${({ theme }) => theme.font.heading ?? theme.font.reading};
            font-size: ${({ theme }) => theme.fontSize.smallHeadline};
            font-weight: ${({ theme }) => theme.fontWeight.bold ?? theme.fontWeight.normal};
        }

        .gp-artists {
            color: ${({ theme }) => theme.color.background.onVariant};
        }
    `,
);

/** An opt in, laid out as one line with its box. */
export const Choice = asPageValue<Wrapper>(
    styled("label")`
        display: flex;
        align-items: center;
        gap: ${({ theme }) => theme.space.half};
        color: ${({ theme }) => theme.color.background.onVariant};
        font-size: ${({ theme }) => theme.fontSize.smallReading};
    `,
);

/** A row of controls, pushed to the end of the panel. */
export const Actions = asPageValue<Wrapper>(
    styled("div")`
        display: flex;
        align-items: center;
        gap: ${({ theme }) => theme.space.half};
    `,
);

/** The tracklist review, one row per Apple track. */
/**
 * The rows of an import, as a table.
 *
 * Fixed columns, because a flex row let the width of the state text
 * feed back into the control beside it: every row's box then started
 * and ended somewhere different.
 */
export const Rows = asPageValue<Wrapper>(
    styled("table")`
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        font-size: ${({ theme }) => theme.fontSize.reading};

        td {
            padding: ${({ theme }) => theme.space.half}
                ${({ theme }) => theme.space.quarter};
            border-bottom: 1px solid ${softBorder};
            vertical-align: middle;
        }

        tr:last-child td {
            border-bottom: none;
        }

        /** Their own number, which is at most three digits. */
        .gp-number {
            width: 2.5rem;
            padding-left: 0;
            color: ${({ theme }) => theme.color.background.onVariant};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
            text-align: right;
        }

        .gp-name {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /** One glyph wide, so the control beside it is the same on
         * every row whatever the row turns out to be doing. */
        .gp-state {
            width: 1.75rem;
            padding-right: 0;
            text-align: center;
        }

        /** A note beside a name, which is not the name itself. */
        .gp-aside {
            color: ${({ theme }) => theme.color.background.onVariant};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
        }

        /** A control at the end of a row, sized by the control. */
        .gp-action {
            width: 1%;
            padding-right: 0;
            white-space: nowrap;
            text-align: right;
        }

        .gp-icon {
            display: block;
            margin: 0 auto;
            color: ${({ theme }) => theme.color.background.onVariant};
        }

        .gp-icon-new {
            color: ${({ theme }) => theme.color.success.main};
        }

        .gp-icon-missing {
            color: ${({ theme }) => theme.color.accent.main};
        }
    `,
);

/** Their own scroller, so a long album does not run off the panel. */
export const Scroller = asPageValue<Wrapper>(
    styled("div")`
        max-height: 26rem;
        overflow-y: auto;
    `,
);

/**
 * A refusal, as plain red text.
 * `accent.main` is the same colour their own inputs turn on `hasError`.
 */
export const Problem = asPageValue<Wrapper>(
    styled("div")`
        display: flex;
        flex-direction: column;
        gap: ${({ theme }) => theme.space.quarter};
        color: ${({ theme }) => theme.color.accent.main};
        font-size: ${({ theme }) => theme.fontSize.smallReading};
        line-height: ${({ theme }) => theme.lineHeight.reading};

        dl {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 2px ${({ theme }) => theme.space.half};
            margin: 0;
        }

        dt,
        dd {
            margin: 0;
        }
    `,
);

/** A line that reports rather than decorates. */
export const Note = asPageValue<Wrapper>(
    styled("p")`
        margin: 0;
        color: ${({ theme }) => theme.color.background.onVariant};
        font-size: ${({ theme }) => theme.fontSize.smallReading};
    `,
);

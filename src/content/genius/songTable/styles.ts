// Spacing here is flex or grid `gap`, never a margin. The only `margin`
// allowed is a zero that neutralises a default someone else set.
/** The table's styled parts. Every theme read happens at render time. */
import {
    asPageValue,
    type DateInputProps,
    type PageComponent,
    type PageNode,
    type PageStyledValue,
} from "@/bindings";
import { DateInput, styled } from "../geniusComponents";

/** A styled part that takes nothing but children. */
type Wrapper = PageComponent<{ readonly children?: PageNode }>;

/** The two pinned columns, whose widths the sticky offsets depend on. */
const TRACK_WIDTH = "3.5rem";
const TITLE_WIDTH = "15rem";

/** The inputs already outline themselves; the grid only hints. */
const softBorder: PageStyledValue = ({ theme }) =>
    `color-mix(in srgb, ${theme.color.border.adaptive} 40%, transparent)`;

/** Their `DateField` layout; the `!important` zero cancels their margin. */
export const DateCell = asPageValue<PageComponent<DateInputProps>>(
    styled(DateInput)`
        display: grid;
        grid-template-columns: 3fr 2fr 2fr;
        gap: ${({ theme }) => theme.space.half};
        align-items: center;
        > * {
            min-width: 0;
            margin-right: 0 !important;
        }
    `,
);

/** Holds the entry point when Genius's own toolbar is not there. */
export const Launch = asPageValue<Wrapper>(
    styled("div")`
        display: flex;
        justify-content: flex-end;
        padding: ${({ theme }) => theme.space.full} 0;
    `,
);

/** The header menu's panel, which `Dropdown` portals into the body. */
export const MenuPanel = asPageValue<Wrapper>(
    styled("div")`
        display: flex;
        flex-direction: column;
        padding: ${({ theme }) => theme.space.quarter} 0;
        min-width: 11rem;
        background: ${({ theme }) => theme.color.background.main};
        font-family: ${({ theme }) => theme.font.reading};

        button {
            display: flex;
            align-items: center;
            padding: ${({ theme }) => theme.space.quarter}
                ${({ theme }) => theme.space.full};
            border: none;
            background: none;
            color: ${({ theme }) => theme.color.background.on};
            font: inherit;
            font-size: ${({ theme }) => theme.fontSize.smallReading};
            text-align: left;
            cursor: pointer;
        }

        button:hover {
            background: ${({ theme }) => theme.color.background.variant};
        }
    `,
);

/** The table itself, styles for its cells included. */
export const Root = asPageValue<Wrapper>(
    styled("section")`
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: ${({ theme }) => theme.space.half};
        margin: 0;
        padding: ${({ theme }) => theme.space.large};
        background: ${({ theme }) => theme.color.background.main};
        font-family: ${({ theme }) => theme.font.reading};
        font-size: ${({ theme }) => theme.fontSize.mediumReading};
        color: ${({ theme }) => theme.color.background.on};

        *,
        *::before,
        *::after {
            box-sizing: border-box;
        }

        .gp-head {
            display: flex;
            flex-wrap: wrap;
            align-items: baseline;
            gap: ${({ theme }) => theme.space.half};
        }

        .gp-title {
            margin: 0;
            font-size: ${({ theme }) => theme.fontSize.smallHeadline};
            font-weight: ${({ theme }) => theme.fontWeight.normal};
        }

        .gp-sub {
            margin: 0;
            color: ${({ theme }) => theme.color.background.onVariant};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
        }

        .gp-spacer {
            flex: 1 1 auto;
        }

        .gp-actions {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: ${({ theme }) => theme.space.half};
        }

        .gp-message {
            margin: 0;
            font-size: ${({ theme }) => theme.fontSize.smallReading};
        }

        .gp-notice {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: ${({ theme }) => theme.space.half};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
            color: ${({ theme }) => theme.color.background.onVariant};
        }

        .gp-scroll {
            max-height: 70vh;
            overflow: auto;
            overscroll-behavior: contain;
            border: 1px solid ${softBorder};
            background: ${({ theme }) => theme.color.background.main};
        }

        table {
            width: max-content;
            min-width: 100%;
            border-collapse: separate;
            border-spacing: 0;
        }

        th,
        td {
            padding: ${({ theme }) => theme.space.quarter}
                ${({ theme }) => theme.space.half};
            border-bottom: 1px solid ${softBorder};
            text-align: left;
            vertical-align: top;
        }

        thead th {
            position: sticky;
            top: 0;
            z-index: 2;
            white-space: nowrap;
            background: ${({ theme }) => theme.color.background.main};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
            font-weight: ${({ theme }) => theme.fontWeight.normal};
            color: ${({ theme }) => theme.color.background.onVariant};
        }

        .gp-header {
            display: flex;
            align-items: center;
            gap: ${({ theme }) => theme.space.quarter};
        }

        .gp-menu {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            border: none;
            border-radius: ${({ theme }) => theme.borderRadius};
            background: none;
            color: inherit;
            line-height: 0;
            cursor: pointer;
        }

        .gp-menu:hover {
            color: ${({ theme }) => theme.color.background.on};
        }

        .gp-stack {
            display: flex;
            flex-direction: column;
            gap: ${({ theme }) => theme.space.quarter};
        }

        .gp-pin-track,
        .gp-pin-title {
            position: sticky;
            background: ${({ theme }) => theme.color.background.main};
        }

        .gp-pin-track {
            left: 0;
            width: ${TRACK_WIDTH};
            min-width: ${TRACK_WIDTH};
            color: ${({ theme }) => theme.color.background.onVariant};
            font-variant-numeric: tabular-nums;
        }

        .gp-track-content {
            display: flex;
            align-items: center;
            gap: ${({ theme }) => theme.space.half};
        }

        .gp-pin-title {
            left: ${TRACK_WIDTH};
            min-width: ${TITLE_WIDTH};
            box-shadow: 1px 0 0 ${softBorder};
        }

        tbody .gp-pin-track,
        tbody .gp-pin-title {
            z-index: 1;
        }

        thead .gp-pin-track,
        thead .gp-pin-title {
            z-index: 3;
        }

        /*
         * On the cell, not a child: a percentage height cannot resolve
         * against a table cell, whose height the table layout decides.
         */
        .gp-pin-track[data-dirty="true"] {
            box-shadow: inset 0.1875rem 0 0
                ${({ theme }) => theme.color.accent.main};
        }

        .gp-row-note {
            display: flex;
            align-items: center;
            gap: ${({ theme }) => theme.space.half};
            color: ${({ theme }) => theme.color.background.onVariant};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
        }

        .gp-error {
            color: ${({ theme }) => theme.color.accent.main};
        }

        .gp-queued {
            color: ${({ theme }) => theme.color.success.main};
        }

        .gp-conflict,
        .gp-conflict > span {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: ${({ theme }) => theme.space.hair};
            font-size: ${({ theme }) => theme.fontSize.xSmallReading};
            color: ${({ theme }) => theme.color.background.onVariant};
        }

        .gp-conflict b {
            font-weight: ${({ theme }) => theme.fontWeight.normal};
            color: ${({ theme }) => theme.color.background.on};
        }

        .gp-flag {
            font-size: ${({ theme }) => theme.fontSize.xSmallReading};
            color: ${({ theme }) => theme.color.background.onVariant};
        }

        .gp-plain {
            display: block;
            padding: ${({ theme }) => theme.space.quarter} 0;
        }
    `,
);

/** The surface the second and third modals both render their body on. */
export const Confirm = asPageValue<Wrapper>(
    styled("section")`
        display: flex;
        flex-direction: column;
        gap: ${({ theme }) => theme.space.half};
        padding: ${({ theme }) => theme.space.large};
        background: ${({ theme }) => theme.color.background.main};
        font-family: ${({ theme }) => theme.font.reading};
        font-size: ${({ theme }) => theme.fontSize.reading};
        line-height: ${({ theme }) => theme.lineHeight.reading};
        color: ${({ theme }) => theme.color.background.on};

        h2 {
            margin: 0;
            font-size: ${({ theme }) => theme.fontSize.smallHeadline};
            font-weight: ${({ theme }) => theme.fontWeight.normal};
        }

        p {
            margin: 0;
        }

        ul {
            display: flex;
            flex-direction: column;
            margin: 0;
            padding: 0;
            max-height: 40vh;
            overflow-y: auto;
            list-style: none;
        }

        li {
            display: flex;
            flex-wrap: wrap;
            gap: ${({ theme }) => theme.space.half};
            padding: ${({ theme }) => theme.space.quarter} 0;
            border-bottom: 1px solid ${softBorder};
            color: ${({ theme }) => theme.color.background.onVariant};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
        }

        .gp-song {
            flex: 0 0 40%;
            color: ${({ theme }) => theme.color.background.on};
        }

        .gp-caveat {
            display: flex;
            flex-direction: column;
            gap: ${({ theme }) => theme.space.half};
            color: ${({ theme }) => theme.color.background.onVariant};
            font-size: ${({ theme }) => theme.fontSize.smallReading};
        }

        /** The fill dialog's single editor, which sets its own height. */
        .gp-editor {
            display: flex;
            flex-direction: column;
            gap: ${({ theme }) => theme.space.half};
            padding: ${({ theme }) => theme.space.quarter} 0;
        }
    `,
);

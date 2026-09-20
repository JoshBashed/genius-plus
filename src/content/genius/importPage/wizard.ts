/** The assistant's state, shaped so a step cannot lack what it renders. */
import type { ContributorPlan } from "../albumImport/contributors";
import type { AlbumCredits } from "../albumImport/credits";
import type { ImportedAlbum } from "../albumImport/importedAlbum";
import type { GeniusAlbum } from "./geniusAlbums";

/**
 * What the reader settled in step two, kept outside the walk so coming
 * back to that step starts on their own answers rather than Apple's.
 */
export interface ConfirmedAlbum {
    /** Chosen, never guessed: Apple has hundreds of genres and Genius
     * has seven primary tags. */
    readonly primaryTagId: number;
    /** Apple's, unless the reader renamed it. */
    readonly albumName: string;
    /** Genius's own code, such as `"zh-Hant"`; Apple gives none. */
    readonly language: string | null;
    /**
     * What their credits pages gave, or `null` when they were not asked
     * for, so a return to step two never reads the same pages again.
     */
    readonly credits: AlbumCredits | null;
}

/**
 * Everything every step after the second is handed.
 *
 * One interface, intersected into each case below, so a field the walk
 * grows is declared once. The album and its credits are both resolved
 * before step three, so no later step has to ask whether it has them.
 */
export interface ImportChoices {
    readonly album: ImportedAlbum;
    readonly artists: ContributorPlan;
    readonly primaryTagId: number;
    readonly albumName: string;
    readonly language: string | null;
    /**
     * The song that named the album, when this run made or chose one.
     * Carried rather than re-found: a renamed song matches neither
     * Apple's title nor, often, a track number.
     */
    readonly firstSongId: number | null;
    /** Empty unless the import went and read their credits pages. */
    readonly credits: AlbumCredits;
    /**
     * The album being imported into, `null` until one is picked or
     * created. Carried from step three so stepping back out of four and
     * into it again does not lose an album that was just created.
     */
    readonly target: GeniusAlbum | null;
}

/** One case per step, carrying exactly what that step needs. */
export type Wizard =
    | { readonly step: 1 }
    | {
          readonly step: 2;
          readonly album: ImportedAlbum;
          readonly artists: ContributorPlan;
      }
    | ({ readonly step: 3 } & ImportChoices)
    | ({ readonly step: 4 } & ImportChoices)
    // The intersection narrows `target`, which is the whole of what step
    // five needs that step four does not guarantee.
    | ({ readonly step: 5; readonly target: GeniusAlbum } & ImportChoices);

export type StepNumber = Wizard["step"];

export const STEP_LABELS: readonly string[] = [
    "Album",
    "Confirm album",
    "Map artists",
    "First song",
    "Confirm import",
];

/** How Apple's genre and credits should meet what Genius already holds. */
export type CreditMode = "empty" | "all";

/** What borrowing something from Genius's own bundle can fail with. */

/** A Genius bundle export we expected to find, and did not. */
export interface BindingError {
    readonly kind: "binding";
    readonly target: string;
    readonly reason: string;
}

/** This page is not one these bindings can work on at all. */
export interface UnsupportedPageError {
    readonly kind: "unsupported";
    readonly reason: string;
}

/** Reaching a chunk fails at the page, or at the chunk itself. */
export type ChunkError = BindingError | UnsupportedPageError;

/**
 * One line naming what could not be bound.
 * @returns The page's own refusal, or the export that went missing.
 */
export const describeBindingError = (error: ChunkError): string =>
    error.kind === "unsupported"
        ? error.reason
        : `Could not bind ${error.target}: ${error.reason}`;

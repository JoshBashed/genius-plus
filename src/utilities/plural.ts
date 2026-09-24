/** Counting things in a sentence. */

/** `3 tracks`, `1 track`. English only, which is all these notes are. */
export const plural = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

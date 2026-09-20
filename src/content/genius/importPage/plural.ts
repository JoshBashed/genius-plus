/** Counting things in a sentence, which every step of the walk does. */

/** `3 tracks`, `1 track`. English only, which is all these notes are. */
export const plural = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Apple's album, restated in the terms the table's columns use. */
import type { DateComponents } from "@/bindings";
import type { AppleAlbum, AppleTrack } from "@/utilities/appleAlbum";
import {
    splitFeatureClauses,
    splitFeatureSuffix,
} from "@/utilities/creditNames";
import type { AlbumType } from "../importPage/updateAlbum";
import { EMPTY_DATE } from "../metadata";

export interface ImportedTrack {
    /** Apple's track id, which keys this row through every step. */
    readonly key: number;
    /** The title with its feature clauses taken out, as Genius stores it. */
    readonly title: string;
    readonly trackNumber: number | null;
    readonly discNumber: number | null;
    readonly releaseDate: DateComponents;
    /** The raw credit for the leads, resolved into names later. */
    readonly primaryCredit: string;
    /** Raw credits for the guests, from the title and from the credit. */
    readonly featuredCredits: readonly string[];
}

export interface ImportedAlbum {
    /** Apple's own album id, which survives a trip through their form. */
    readonly albumId: string;
    readonly title: string;
    readonly artistName: string;
    readonly artworkUrl: string | null;
    readonly storefront: string;
    /** The album's own date, which is not any track's. */
    readonly releaseDate: DateComponents;
    readonly genre: string | null;
    readonly tracks: readonly ImportedTrack[];
}

/** A compilation's album credit, which is nobody and must not be staged. */
const VARIOUS = "various artists";

/** Apple dates are ISO-8601 in UTC; the date part is what their UI shows. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Reads Apple's timestamp as the three parts Genius stores.
 * @returns An empty date rather than a guess when the string is not one.
 */
export const appleDate = (value: string | null): DateComponents => {
    const parts = value === null ? null : ISO_DATE.exec(value);

    if (parts?.[1] === undefined) {
        return EMPTY_DATE;
    }

    return {
        day: Number(parts[3]),
        month: Number(parts[2]),
        year: Number(parts[1]),
    };
};

const importedTrack = (track: AppleTrack): ImportedTrack => {
    const { clauses, title } = splitFeatureClauses(track.title);
    const { guests, lead } = splitFeatureSuffix(track.artistName);
    // A compilation credits the album to nobody, so it names no lead.
    const primaryCredit = lead.toLowerCase() === VARIOUS ? "" : lead;

    return {
        discNumber: track.discNumber,
        featuredCredits: guests === null ? clauses : [...clauses, guests],
        key: track.trackId,
        primaryCredit,
        releaseDate: appleDate(track.releaseDate),
        title,
        trackNumber: track.trackNumber,
    };
};

export const importedAlbum = (album: AppleAlbum): ImportedAlbum => ({
    albumId: album.albumId,
    artistName: album.artistName,
    artworkUrl: album.artworkUrl,
    releaseDate: appleDate(album.releaseDate),
    storefront: album.storefront,
    genre: album.genre,
    title: album.title,
    tracks: album.tracks.map(importedTrack),
});

/** Every raw credit the album names, deduplicated, in the order they appear. */
export const albumCredits = (album: ImportedAlbum): readonly string[] => {
    const seen = new Set<string>();
    const credits: string[] = [];

    const take = (credit: string): void => {
        const key = credit.trim().toLowerCase();

        if (key !== "" && !seen.has(key)) {
            seen.add(key);
            credits.push(credit.trim());
        }
    };

    for (const track of album.tracks) {
        take(track.primaryCredit);

        for (const credit of track.featuredCredits) {
            take(credit);
        }
    }

    return credits;
};

/** Apple's own suffixes for the two kinds that are not a full album. */
const SINGLE = /\s-\s*single$/i;
const EP = /\s-\s*ep$/i;

/**
 * Their kind for an album, read off Apple's own title.
 * Apple appends "- Single" and "- EP" itself, which beats guessing from
 * a track count: plenty of EPs run to six tracks and plenty do not.
 */
export const appleAlbumType = (album: ImportedAlbum): AlbumType => {
    if (SINGLE.test(album.title)) {
        return "single";
    }

    return EP.test(album.title) ? "ep" : "album";
};

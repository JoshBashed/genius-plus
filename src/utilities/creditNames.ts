/** Credit strings as streaming services write them, taken apart in stages. */

/** A bracketed feature clause, which Genius stores away from the title. */
const FEATURE_CLAUSE =
    /[([]\s*(?:feat|ft|featuring|with)\b\.?\s*([^)\]]+?)\s*[)\]]/gi;

/** The same clause unbracketed, which only ever runs to the end. */
const FEATURE_SUFFIX = /\s+(?:feat|ft|featuring)\b\.?\s+(.+)$/i;

/**
 * What separates one name from the next inside a single credit.
 * The word "and" is not one, since acts are spelled with it, and a credit
 * is only ever split once Genius has been asked about the whole string.
 */
const SEPARATORS = /\s*(?:,|&|\+)\s*/g;

/** Collapses the whitespace taking a string apart leaves behind. */
const tidy = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * Splits one credit into the names it lists.
 * @returns Every name, in order, with blanks and repeats dropped.
 */
export const splitNames = (credit: string): readonly string[] => {
    const seen = new Set<string>();

    return credit
        .split(SEPARATORS)
        .map(tidy)
        .filter((name) => {
            const key = name.toLowerCase();

            if (name === "" || seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        });
};

export interface LeadAndGuests {
    /** The credit with any trailing feature clause removed. */
    readonly lead: string;
    /** The clause's own text, still unsplit, or `null` if there was none. */
    readonly guests: string | null;
}

/** Separates a credit's leads from anyone it says is featured on it. */
export const splitFeatureSuffix = (credit: string): LeadAndGuests => {
    const found = FEATURE_SUFFIX.exec(credit);

    if (found?.[1] === undefined) {
        return { guests: null, lead: tidy(credit) };
    }

    return {
        guests: tidy(found[1]),
        lead: tidy(credit.slice(0, found.index)),
    };
};

export interface TitleAndGuests {
    /** The title with every feature clause taken out of it. */
    readonly title: string;
    /** Each clause's own text, still unsplit. */
    readonly clauses: readonly string[];
}

/** Lifts the feature clauses out of a track title, as Genius stores it. */
export const splitFeatureClauses = (title: string): TitleAndGuests => {
    const clauses: string[] = [];
    // `replace` is the only way to read every match and rebuild in one pass.
    const bare = title.replace(FEATURE_CLAUSE, (_match, names: string) => {
        clauses.push(tidy(names));
        return "";
    });

    return { clauses, title: tidy(bare) };
};

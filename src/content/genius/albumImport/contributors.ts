/** Every name the import found, and the Genius artist each one maps to. */
import type { Result } from "@resulted/results";
import type { SelectOption } from "@/bindings";
import { splitNames } from "@/utilities/creditNames";
import type { ReadFailure } from "../api";
import { optionLabel, searchArtists, uniqueOptions } from "../options";
import { drain } from "../pool";
import { albumCredits, type ImportedAlbum } from "./importedAlbum";

/** Four at a time, matching the metadata reads beside it. */
const CONCURRENCY = 4;

export interface Contributor {
    /** The name as the import found it, which is the key's own spelling. */
    readonly name: string;
    /** The credit it was split out of, or `null` if it stood alone. */
    readonly from: string | null;
    /** What Genius offered, so the popup can suggest without searching. */
    readonly suggestions: readonly SelectOption[];
    /** Genius artists this name stages, empty meaning it stages nothing. */
    readonly options: readonly SelectOption[];
    /** Whether an exact match chose `options`, rather than nobody having. */
    readonly matched: boolean;
    /**
     * How many Genius artists carry this exact name.
     * Two or more is a disambiguation, which only a person can settle, so
     * the field is left blank rather than filled with the first of them.
     */
    readonly exactCount: number;
}

/** Keyed by lowercased name, so a lookup never depends on casing. */
export type Contributors = Readonly<Record<string, Contributor>>;

export interface ContributorPlan {
    /**
     * Each raw credit's names, once the split rule had decided them.
     * Keyed by lowercased credit, as `contributors` is, so a track
     * spelling a credit differently still finds the names it stages.
     */
    readonly names: Readonly<Record<string, readonly string[]>>;
    readonly contributors: Contributors;
}

export const nameKey = (name: string): string => name.trim().toLowerCase();

/** Every Genius artist carrying exactly this name. */
const exactMatches = (
    options: readonly SelectOption[],
    name: string,
): readonly SelectOption[] =>
    options.filter(
        (option) => nameKey(optionLabel(option.label)) === nameKey(name),
    );

/**
 * The one artist by that name, if there is exactly one.
 * @returns `null` when nobody matches, and when several do: a name two
 * artists share is a question, not an answer.
 */
const soleExact = (
    options: readonly SelectOption[],
    name: string,
): SelectOption | null => {
    const exact = exactMatches(options, name);

    return exact.length === 1 ? (exact[0] ?? null) : null;
};

/** The same names in order, with any later spelling of one dropped. */
const uniqueNames = (names: readonly string[]): readonly string[] => [
    ...new Map(names.map((name) => [nameKey(name), name])).values(),
];

/** What one lookup answered, or the failure that means it did not. */
type Answer = Result<readonly SelectOption[], ReadFailure>;

/** What Genius offered for a name, which is nothing when the ask failed. */
const offered = (answer: Answer | undefined): readonly SelectOption[] =>
    answer?.isOk() === true ? answer.value : [];

/**
 * Resolves every credit on an album into names, and names into artists.
 *
 * A credit is only split on its separators once Genius has been asked
 * whether it knows the whole string, because acts like "Earth, Wind &
 * Fire" are spelled with the very characters a split would cut on.
 *
 * @param onProgress Called with how many credits have been looked up.
 */
export const resolveContributors = async (
    album: ImportedAlbum,
    onProgress: (done: number, total: number) => void = () => {},
    /** Names from elsewhere, such as the per song writers and producers. */
    extra: readonly string[] = [],
): Promise<ContributorPlan> => {
    const credits = [...albumCredits(album), ...extra];
    const found = new Map<string, Answer>();
    let done = 0;

    const lookUp = async (term: string): Promise<void> => {
        if (found.has(nameKey(term))) {
            return;
        }

        found.set(nameKey(term), await searchArtists(term));
    };

    await drain(credits, CONCURRENCY, async (credit) => {
        await lookUp(credit);
        done += 1;
        onProgress(done, credits.length);
    });

    const names: Record<string, readonly string[]> = {};
    const pending: { readonly name: string; readonly from: string }[] = [];
    const contributors: Record<string, Contributor> = {};

    for (const credit of credits) {
        const key = nameKey(credit);
        const answer = found.get(key);
        const suggestions = offered(answer);
        const whole = exactMatches(suggestions, credit);
        // A lookup that failed is not Genius saying it knows nobody, and
        // splitting on it is how "Earth, Wind & Fire" would become three
        // people who never existed.
        const answered = answer?.isOk() === true;

        // Any exact match settles that this is one act, so it is not
        // split, and nor is a credit Genius was never reached about.
        // Whether it can be filled in is a separate question.
        if (whole.length > 0 || !answered) {
            names[key] = [credit];
            contributors[key] = {
                exactCount: whole.length,
                from: null,
                matched: whole.length === 1,
                name: credit,
                options: whole.length === 1 ? whole : [],
                suggestions,
            };
            continue;
        }

        const parts = splitNames(credit);
        // A credit nothing separates is one unmatched name, not none.
        const split = parts.length === 0 ? [credit] : parts;

        names[key] = split;

        for (const part of split) {
            pending.push({ from: credit, name: part });
        }
    }

    const unresolved = pending.filter(
        (entry) => contributors[nameKey(entry.name)] === undefined,
    );

    await drain(unresolved, CONCURRENCY, async (entry) => {
        await lookUp(entry.name);
    });

    for (const entry of unresolved) {
        const key = nameKey(entry.name);

        if (contributors[key] !== undefined) {
            continue;
        }

        const suggestions = offered(found.get(key));
        const exact = soleExact(suggestions, entry.name);

        contributors[key] = {
            exactCount: exactMatches(suggestions, entry.name).length,
            // A name that is the whole credit was not split out of one.
            from: nameKey(entry.from) === key ? null : entry.from,
            matched: exact !== null,
            name: entry.name,
            options: exact === null ? [] : [exact],
            suggestions,
        };
    }

    return { contributors, names };
};

/** Replaces one name's mapping, leaving every other name alone. */
export const withMapping = (
    plan: ContributorPlan,
    name: string,
    options: readonly SelectOption[],
): ContributorPlan => {
    const key = nameKey(name);
    const current = plan.contributors[key];

    if (current === undefined) {
        return plan;
    }

    return {
        contributors: {
            ...plan.contributors,
            [key]: { ...current, options },
        },
        names: plan.names,
    };
};

/** The chips a list of already separated names stages, in their order. */
export const namesOptions = (
    plan: ContributorPlan,
    names: readonly string[],
): readonly SelectOption[] =>
    uniqueOptions(
        names.flatMap(
            (name) => plan.contributors[nameKey(name)]?.options ?? [],
        ),
    );

/**
 * The chips one raw credit stages, in the order the credit named them.
 * @returns An empty list when every name in it maps to nothing.
 */
export const creditOptions = (
    plan: ContributorPlan,
    credit: string,
): readonly SelectOption[] =>
    namesOptions(plan, plan.names[nameKey(credit)] ?? []);

/** Every contributor, in a stable order with the ones needing a look first. */
export const contributorList = (
    plan: ContributorPlan,
): readonly Contributor[] => {
    // By name alone. Sorting the unmapped to the top moved a row the
    // moment it was mapped, under the cursor that had just mapped it;
    // the icon beside each name is what says which still need one.
    return [...Object.values(plan.contributors)].sort((left, right) =>
        left.name.localeCompare(right.name),
    );
};

/** How many names would stage nothing, which is what the popup is for. */
export const unmappedCount = (plan: ContributorPlan): number =>
    Object.values(plan.contributors).filter(
        (entry) => entry.options.length === 0,
    ).length;

/**
 * The same plan, with names it has not seen resolved into it.
 *
 * Credits arrive after the album does, so this adds them rather than
 * resolving everything a second time.
 */
export const withExtraNames = async (
    plan: ContributorPlan,
    names: readonly string[],
    onProgress: (done: number, total: number) => void = () => {},
): Promise<ContributorPlan> => {
    const fresh = uniqueNames(names).filter(
        (name) => plan.contributors[nameKey(name)] === undefined,
    );

    if (fresh.length === 0) {
        return plan;
    }

    const added: Record<string, Contributor> = {};
    let done = 0;

    await drain(fresh, CONCURRENCY, async (name) => {
        const suggestions = offered(await searchArtists(name));
        const exact = exactMatches(suggestions, name);

        added[nameKey(name)] = {
            exactCount: exact.length,
            from: null,
            matched: exact.length === 1,
            name,
            options: exact.length === 1 ? exact : [],
            suggestions,
        };

        done += 1;
        onProgress(done, fresh.length);
    });

    return {
        contributors: { ...plan.contributors, ...added },
        names: plan.names,
    };
};

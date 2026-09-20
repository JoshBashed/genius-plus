/** Apple's per song credits, which their album lookup does not carry. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { type DecodeFailure, decode, decodeOr } from "./decode";

/** Their catalogue API, which answers with credits when asked. */
export const ampSongUrl = (storefront: string, trackId: number): string => {
    const query = new URLSearchParams({
        "format[resources]": "map",
        include: "credits",
        l: "en-US",
        platform: "web",
    });

    return `https://amp-api.music.apple.com/v1/catalog/${storefront}/songs/${trackId}?${query}`;
};

export interface AppleCredit {
    readonly name: string;
    /** Apple's own role words, such as `["Lyrics", "Composer"]`. */
    readonly roles: readonly string[];
}

export interface AppleSongCredits {
    readonly writers: readonly string[];
    readonly producers: readonly string[];
    /** Everyone credited, roles and all, for anything else to read. */
    readonly performers: readonly AppleCredit[];
}

/**
 * Their own grouping, which is what their page shows and we follow.
 *
 * Reading role words instead dropped everyone their categories include
 * and a word list does not: an `Arranger` is under composition there,
 * and mixing and mastering are under production.
 */
const WRITER_KIND = "composer-and-lyrics";
const PRODUCER_KIND = "production-and-engineering";

/** Only for an answer that carries no categories at all. */
const WRITER_ROLES = new Set([
    "arranger",
    "composer",
    "lyricist",
    "lyrics",
    "songwriter",
    "writer",
]);

const PRODUCER_ROLES = new Set([
    "additional production",
    "co-producer",
    "engineer",
    "executive producer",
    "mastering engineer",
    "mixing engineer",
    "producer",
    "recording engineer",
    "vocal producer",
]);

/**
 * Their catalogue answer, as `format[resources]=map` shapes it.
 *
 * The credits come back keyed by id under `credit-artists`, so the
 * schema only has to describe one entry and the map around it.
 */
const creditSchema = z.object({
    attributes: z.object({
        name: z.string(),
        roleNames: z.array(z.string()).min(1),
    }),
});

/** One of their groups, and the credits it gathers, in their order. */
const categorySchema = z.object({
    attributes: z.object({ kind: z.string() }),
    relationships: z.object({
        "credit-artists": z.object({
            data: z.array(z.object({ id: z.string() })),
        }),
    }),
});

const answerSchema = z.object({
    resources: z.object({
        "credit-artists": z.record(z.string(), z.unknown()),
        "role-categories": z.record(z.string(), z.unknown()).nullish(),
    }),
});

const named = (
    credits: readonly AppleCredit[],
    roles: ReadonlySet<string>,
): readonly string[] => {
    const seen = new Set<string>();

    return credits.flatMap((credit): readonly string[] => {
        const matched = credit.roles.some((role) =>
            roles.has(role.trim().toLowerCase()),
        );
        const key = credit.name.trim().toLowerCase();

        if (!matched || key === "" || seen.has(key)) {
            return [];
        }

        seen.add(key);
        return [credit.name.trim()];
    });
};

/** One credited name, trimmed, or nothing when the entry has none. */
const nameOf = (entry: unknown): string | null => {
    const parsed = decodeOr(creditSchema, entry);
    const name = parsed?.attributes.name.trim() ?? "";

    return name === "" ? null : name;
};

/**
 * Their groups, each as the names in it, in the order they list them.
 *
 * A name is taken once per group: their catalogue lists a person once
 * per role, so someone credited twice in one group appears twice here
 * without this.
 */
const byCategory = (
    categories: Readonly<Record<string, unknown>>,
    artists: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, readonly string[]> => {
    const grouped = new Map<string, readonly string[]>();

    for (const entry of Object.values(categories)) {
        const parsed = decodeOr(categorySchema, entry);

        if (parsed === null) {
            continue;
        }

        const seen = new Set<string>();
        const names = parsed.relationships["credit-artists"].data.flatMap(
            (one): readonly string[] => {
                const name = nameOf(artists[one.id]);
                const key = name === null ? "" : name.toLowerCase();

                if (name === null || seen.has(key)) {
                    return [];
                }

                seen.add(key);
                return [name];
            },
        );

        if (names.length > 0) {
            grouped.set(parsed.attributes.kind, names);
        }
    }

    return grouped;
};

/**
 * Reads one song's credits out of their catalogue answer.
 *
 * `format[resources]=map` keys the included resources by id, so the
 * credits are one flat object of `credit-artists` rather than a tree to
 * walk. One person appears once per role group, not once overall.
 */
export const readAppleCredits = (
    body: unknown,
): Result<AppleSongCredits, DecodeFailure> => {
    const answer = decode(answerSchema, body, "Apple's credits");

    if (answer.isErr()) {
        return answer;
    }

    // An entry credited for nothing is skipped, not an error: their
    // catalogue does list people with no roles.
    const credits = Object.values(
        answer.value.resources["credit-artists"],
    ).flatMap((entry): readonly AppleCredit[] => {
        const parsed = decodeOr(creditSchema, entry);

        return parsed === null
            ? []
            : [
                  {
                      name: parsed.attributes.name,
                      roles: parsed.attributes.roleNames,
                  },
              ];
    });

    const grouped = byCategory(
        answer.value.resources["role-categories"] ?? {},
        answer.value.resources["credit-artists"],
    );

    return Result.ok({
        performers: credits,
        producers: grouped.get(PRODUCER_KIND) ?? named(credits, PRODUCER_ROLES),
        writers: grouped.get(WRITER_KIND) ?? named(credits, WRITER_ROLES),
    });
};

/** Option sources. An artist label is an object, a tag label a string. */

import { Result } from "@resulted/results";
import { z } from "zod";
import type { SelectOption } from "@/bindings";
import { decodeOr } from "@/utilities/decode";
import { apiGet, type ReadFailure } from "./api";
import type { NamedRef } from "./metadata";

/** Genius debounces its own autocompletes by this much. Match it. */
const DEBOUNCE_MS = 150;

/** One artist hit, with the "AKA" alternate their own menu shows. */
const artistSchema = z.object({
    id: z.number(),
    match_metadata: z
        .object({ alternate_name: z.string().nullish() })
        .nullish(),
    name: z.string(),
});

const artistsSchema = z.object({
    artists: z.array(z.unknown()).default([]),
});

/** One song hit: the title with features, the artists below it. */
const songHitSchema = z.object({
    result: z.object({
        artist_names: z.string().nullish(),
        id: z.number(),
        title: z.string(),
        title_with_featured: z.string().nullish(),
    }),
});

const songsSchema = z.object({
    sections: z
        .array(z.object({ hits: z.array(z.unknown()).default([]) }))
        .default([]),
});

/** Every tag list they answer with, whatever the endpoint. */
const tagSchema = z.object({ id: z.number(), name: z.string() });

const tagsSchema = z.object({ tags: z.array(z.unknown()).default([]) });

/** A row that will not parse is one option missing, not a failed menu. */
const tagOptions = (body: unknown): readonly SelectOption[] => {
    const parsed = decodeOr(tagsSchema, body);

    return (parsed?.tags ?? []).flatMap((row): readonly SelectOption[] => {
        const tag = decodeOr(tagSchema, row);

        return tag === null ? [] : [{ label: tag.name, value: tag.id }];
    });
};

/** Debounce that resolves a superseded call with the newer answer. */
const debounced = (
    load: (input: string) => Promise<readonly SelectOption[]>,
): ((input: string) => Promise<readonly SelectOption[]>) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let waiting: ((options: readonly SelectOption[]) => void)[] = [];

    return (input) =>
        new Promise((resolve) => {
            waiting.push(resolve);

            if (timer !== null) {
                clearTimeout(timer);
            }

            timer = setTimeout(() => {
                timer = null;
                // Every superseded call settles on this one's answer.
                const settling = waiting;
                waiting = [];

                void load(input).then((options) => {
                    for (const settle of settling) {
                        settle(options);
                    }
                });
            }, DEBOUNCE_MS);
        });
};

/**
 * `GET /artists/autocomplete?q=`, with the "AKA" alternate below.
 *
 * Undebounced, because the import resolves many names at once and the
 * debounce settles every waiting caller on the last one's answer. The
 * failure is the read's own, because a caller that splits a credit only
 * once Genius has been asked has to tell a failed ask from an empty one.
 */
export const searchArtists = async (
    input: string,
): Promise<Result<readonly SelectOption[], ReadFailure>> => {
    const response = await apiGet("/artists/autocomplete", { q: input });

    if (response.isErr()) {
        return Result.err(response.error);
    }

    const parsed = decodeOr(artistsSchema, response.value);
    const options = (parsed?.artists ?? []).flatMap(
        (row): readonly SelectOption[] => {
            const artist = decodeOr(artistSchema, row);

            if (artist === null) {
                return [];
            }

            const alternate = artist.match_metadata?.alternate_name;

            return [
                {
                    value: artist.id,
                    label: {
                        primary: artist.name,
                        ...(alternate == null
                            ? {}
                            : {
                                  secondary: alternate,
                                  secondaryPrefix: "AKA",
                              }),
                    },
                },
            ];
        },
    );

    return Result.ok(options);
};

/** The same search, paced for a field the user is typing into. */
export const loadArtistOptions = debounced(async (input: string) => {
    const found = await searchArtists(input);

    return found.isOk() ? found.value : [];
});

/**
 * `GET /search/song?q=`, the source their tracklist editor searches.
 * Their own hit shape: the title with features, the artists below it.
 */
export const searchSongs = async (
    input: string,
): Promise<readonly SelectOption[]> => {
    const response = await apiGet("/search/song", { q: input });

    if (response.isErr()) {
        return [];
    }

    const parsed = decodeOr(songsSchema, response.value);

    return (parsed?.sections[0]?.hits ?? []).flatMap(
        (row): readonly SelectOption[] => {
            const hit = decodeOr(songHitSchema, row);

            if (hit === null) {
                return [];
            }

            const { artist_names, id, title, title_with_featured } = hit.result;

            return [
                {
                    value: id,
                    label: {
                        primary: title_with_featured ?? title,
                        ...(artist_names == null
                            ? {}
                            : { secondary: artist_names }),
                    },
                },
            ];
        },
    );
};

/** The same search, paced for a field the user is typing into. */
export const loadSongOptions = debounced(searchSongs);

/** `GET /tags/autocomplete?q=`. Tag labels are plain strings. */
export const loadTagOptions = debounced(async (input: string) => {
    const response = await apiGet("/tags/autocomplete", { q: input });

    return response.isErr() ? [] : tagOptions(response.value);
});

/** `GET /tags/home`, a closed list. Empty is survivable. */
export const loadPrimaryTagOptions = async (): Promise<
    readonly SelectOption[]
> => {
    const response = await apiGet("/tags/home");

    return response.isErr() ? [] : tagOptions(response.value);
};

/** A stored credit, as a chip. Mirrors their `transformForInput`. */
export const refToOption = (ref: NamedRef): SelectOption =>
    ref.id === null
        ? { value: ref.name, label: ref.name, __isNew__: true }
        : { value: ref.id, label: ref.name };

/** An artist chip, which wants the two-line label shape. */
export const artistToOption = (ref: NamedRef): SelectOption =>
    ref.id === null
        ? { value: ref.name, label: { primary: ref.name }, __isNew__: true }
        : { value: ref.id, label: { primary: ref.name } };

/** An option's label as text, whichever of its three shapes it has. */
export const optionLabel = (label: SelectOption["label"]): string => {
    if (typeof label === "string") {
        return label;
    }

    return typeof label === "number" ? String(label) : label.primary;
};

/** Back the other way, for the export. Mirrors `transformForForm`. */
export const optionToRef = (option: SelectOption): NamedRef => {
    const name = optionLabel(option.label);

    return option.__isNew__ === true || typeof option.value !== "number"
        ? { id: null, name }
        : { id: option.value, name };
};

/** The same options in order, with any later repeat of a value dropped. */
export const uniqueOptions = (
    options: readonly SelectOption[],
): readonly SelectOption[] => {
    const seen = new Set<string | number>();

    return options.filter((option) => {
        if (seen.has(option.value)) {
            return false;
        }

        seen.add(option.value);
        return true;
    });
};

/** Finds the option matching a stored scalar, by value. */
export const optionFor = (
    options: readonly SelectOption[],
    value: string | number | null,
): SelectOption | null => {
    if (value === null) {
        return null;
    }

    return options.find((option) => option.value === value) ?? null;
};

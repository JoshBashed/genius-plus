/** Option sources. An artist label is an object, a tag label a string. */

import type { SelectOption } from "@/bindings";
import { apiGet } from "./api";
import type { NamedRef } from "./metadata";

/** Genius debounces its own autocompletes by this much. Match it. */
const DEBOUNCE_MS = 150;

const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const rows = (value: unknown): readonly Record<string, unknown>[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry: unknown) => {
        const row = record(entry);
        return row === null ? [] : [row];
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

/** `GET /artists/autocomplete?q=`, with the "AKA" alternate below. */
export const loadArtistOptions = debounced(async (input: string) => {
    const response = await apiGet("/artists/autocomplete", { q: input });

    if (response.isErr()) {
        return [];
    }

    return rows(response.value.artists).flatMap(
        (artist): readonly SelectOption[] => {
            const id = artist.id;
            const name = artist.name;

            if (typeof id !== "number" || typeof name !== "string") {
                return [];
            }

            const alternate = record(artist.match_metadata)?.alternate_name;

            return [
                {
                    value: id,
                    label: {
                        primary: name,
                        ...(typeof alternate === "string"
                            ? { secondary: alternate, secondaryPrefix: "AKA" }
                            : {}),
                    },
                },
            ];
        },
    );
});

/** `GET /tags/autocomplete?q=`. Tag labels are plain strings. */
export const loadTagOptions = debounced(async (input: string) => {
    const response = await apiGet("/tags/autocomplete", { q: input });

    if (response.isErr()) {
        return [];
    }

    return rows(response.value.tags).flatMap((tag): readonly SelectOption[] => {
        const id = tag.id;
        const name = tag.name;

        return typeof id === "number" && typeof name === "string"
            ? [{ value: id, label: name }]
            : [];
    });
});

/** `GET /tags/home`, a closed list. Empty is survivable. */
export const loadPrimaryTagOptions = async (): Promise<
    readonly SelectOption[]
> => {
    const response = await apiGet("/tags/home");

    if (response.isErr()) {
        return [];
    }

    return rows(response.value.tags).flatMap((tag): readonly SelectOption[] => {
        const id = tag.id;
        const name = tag.name;

        return typeof id === "number" && typeof name === "string"
            ? [{ value: id, label: name }]
            : [];
    });
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

const labelText = (label: SelectOption["label"]): string => {
    if (typeof label === "string") {
        return label;
    }

    return typeof label === "number" ? String(label) : label.primary;
};

/** Back the other way, for the export. Mirrors `transformForForm`. */
export const optionToRef = (option: SelectOption): NamedRef => {
    const name = labelText(option.label);

    return option.__isNew__ === true || typeof option.value !== "number"
        ? { id: null, name }
        : { id: option.value, name };
};

export const optionLabel = labelText;

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

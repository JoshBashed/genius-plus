/** Shapes more than one of Genius's endpoints answer with. */
import { z } from "zod";
import { decodeOr } from "@/utilities/decode";

/**
 * A list where a row that will not parse is dropped, not fatal: one
 * unreadable row is one thing missing, not a failed answer.
 */
export const rows = <Row extends z.ZodType>(row: Row) =>
    z.array(z.unknown()).transform((items) =>
        items.flatMap((item): z.output<Row>[] => {
            const parsed = decodeOr(row, item);

            return parsed === null ? [] : [parsed];
        }),
    );

/** A release date; any part of it may be unset. */
export const dateSchema = z.object({
    day: z.number().nullish(),
    month: z.number().nullish(),
    year: z.number().nullish(),
});

/** A credit or a tag; `id` is absent for a value Genius has never seen. */
export const refSchema = z.object({
    id: z.number().nullish(),
    name: z.string(),
});

/** One of the credits or tags above. */
export type Ref = z.output<typeof refSchema>;

/** An album as a song lists it, which carries no artist. */
export const albumRefSchema = z.object({
    id: z.number(),
    name: z.string(),
    url: z.string().nullish(),
});

/** One of the album references above. */
export type AlbumRef = z.output<typeof albumRefSchema>;

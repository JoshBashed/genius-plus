/** Genius's tags: the search, and the closed list of primary tags. */
import type { Result } from "@resulted/results";
import { z } from "zod";
import {
    geniusRead,
    type ReadFailure,
} from "@/content/genius/geniusApi/request";
import { rows } from "@/content/genius/geniusApi/schemas";

/** Every tag list they answer with, whatever the endpoint. */
const tagSchema = z.object({ id: z.number(), name: z.string() });

const tagsSchema = z.object({ tags: rows(tagSchema).default([]) });

/** One tag. */
export type Tag = z.output<typeof tagSchema>;

/** `GET /tags/autocomplete?q=`. */
export const searchTags = async (
    query: string,
): Promise<Result<readonly Tag[], ReadFailure>> =>
    (
        await geniusRead(
            {
                path: "/tags/autocomplete",
                query: { q: query },
                what: "a tag search",
            },
            tagsSchema,
        )
    ).map((answer) => answer.tags);

/** `GET /tags/home`, the primary tags a song can have. */
export const getPrimaryTags = async (): Promise<
    Result<readonly Tag[], ReadFailure>
> =>
    (
        await geniusRead(
            { path: "/tags/home", what: "the primary tags" },
            tagsSchema,
        )
    ).map((answer) => answer.tags);

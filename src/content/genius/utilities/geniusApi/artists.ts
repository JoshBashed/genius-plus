/** Genius's artists, as its autocomplete finds them. */
import type { Result } from "@resulted/results";
import { z } from "zod";
import {
    geniusRead,
    type ReadFailure,
} from "@/content/genius/utilities/geniusApi/request";
import { rows } from "@/content/genius/utilities/geniusApi/schemas";

/** One artist hit, with the "AKA" alternate their own menu shows. */
const artistSchema = z.object({
    id: z.number(),
    match_metadata: z
        .object({ alternate_name: z.string().nullish() })
        .nullish(),
    name: z.string(),
});

/** One artist a search found. */
export type ArtistHit = z.output<typeof artistSchema>;

/** `GET /artists/autocomplete?q=`. */
export const searchArtists = async (
    query: string,
): Promise<Result<readonly ArtistHit[], ReadFailure>> =>
    (
        await geniusRead(
            {
                path: "/artists/autocomplete",
                query: { q: query },
                what: "an artist search",
            },
            z.object({ artists: rows(artistSchema).default([]) }),
        )
    ).map((answer) => answer.artists);

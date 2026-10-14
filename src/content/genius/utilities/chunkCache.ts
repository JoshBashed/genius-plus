/** The donor page's chunk URLs, kept in extension storage between pages. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { decodeOr } from "@/utilities/decode";
import { GENIUS_CHANNEL } from "../relay";

const STORAGE_KEY = "geniusChunks";

const READ = "to-isolated-chunks-read";
const WRITE = "to-isolated-chunks-write";
const ANSWER = "to-main-chunks";

/** The isolated half answers at once; this only covers one gone missing. */
const READ_TIMEOUT_MS = 2_000;

const cachedSchema = z.object({
    savedAt: z.number(),
    urls: z.record(z.string(), z.string()),
});

const readSchema = z.object({
    channel: z.literal(GENIUS_CHANNEL),
    direction: z.literal(READ),
    id: z.number(),
});

const writeSchema = z.object({
    cached: cachedSchema,
    channel: z.literal(GENIUS_CHANNEL),
    direction: z.literal(WRITE),
});

const answerSchema = z.object({
    cached: cachedSchema.nullable(),
    channel: z.literal(GENIUS_CHANNEL),
    direction: z.literal(ANSWER),
    id: z.number(),
});

/** A chunk list, and when it was read from the donor page. */
export interface CachedChunks {
    readonly urls: ReadonlyMap<string, string>;
    readonly savedAt: number;
}

/** The origin Genius serves its chunks from: where its React comes from. */
const chunkOrigin = (): string | null => {
    const sources = document.querySelectorAll<
        HTMLLinkElement | HTMLScriptElement
    >('head link[rel="modulepreload"][href], head script[type="module"][src]');

    for (const source of sources) {
        const href =
            source instanceof HTMLLinkElement ? source.href : source.src;
        const url = URL.canParse(href) ? new URL(href) : null;

        if (url !== null && /\/react-vendor-[\w-]{8}\.js$/.test(url.pathname)) {
            return url.origin;
        }
    }

    return null;
};

/**
 * Whether a list names only Genius's own chunks.
 * Any script on the page can post these messages, so nothing it sends
 * may point an `import()` anywhere else.
 */
const trusted = (cached: z.output<typeof cachedSchema>): boolean => {
    const origin = chunkOrigin();

    return (
        origin !== null &&
        Object.values(cached.urls).every((url) => {
            const parsed = URL.canParse(url) ? new URL(url) : null;

            return parsed?.origin === origin && parsed.pathname.endsWith(".js");
        }) &&
        // Never ahead of now, or it would never expire.
        cached.savedAt <= Date.now()
    );
};

/**
 * Storage, which throws synchronously once the extension has reloaded.
 * Deferred, so that throw becomes a rejection `Result.try` can catch.
 */
const storage = <T>(call: () => Promise<T>): Promise<T> =>
    Promise.resolve().then(call);

/** Same window only; Genius embeds chatty iframes. */
const dataOf = (event: MessageEvent): unknown =>
    event.source === window ? event.data : null;

/** Counted, not random: only uniqueness within one document matters. */
let nextId = 0;

/**
 * Main: the cached chunk list.
 * @returns `null` when nothing is cached or the isolated half is silent.
 */
export const readChunkCache = (): Promise<CachedChunks | null> => {
    const id = nextId;
    nextId += 1;

    return new Promise((resolve) => {
        const onAnswer = (event: MessageEvent): void => {
            const answer = decodeOr(answerSchema, dataOf(event));

            if (answer !== null && answer.id === id) {
                settle(
                    answer.cached === null || !trusted(answer.cached)
                        ? null
                        : {
                              savedAt: answer.cached.savedAt,
                              urls: new Map(Object.entries(answer.cached.urls)),
                          },
                );
            }
        };

        const timer = setTimeout(() => {
            settle(null);
        }, READ_TIMEOUT_MS);

        const settle = (cached: CachedChunks | null): void => {
            clearTimeout(timer);
            removeEventListener("message", onAnswer);
            resolve(cached);
        };

        addEventListener("message", onAnswer);
        postMessage(
            { channel: GENIUS_CHANNEL, direction: READ, id },
            location.origin,
        );
    });
};

/** Main: replaces the cached chunk list. */
export const writeChunkCache = (cached: CachedChunks): void => {
    postMessage(
        {
            cached: {
                savedAt: cached.savedAt,
                urls: Object.fromEntries(cached.urls),
            },
            channel: GENIUS_CHANNEL,
            direction: WRITE,
        },
        location.origin,
    );
};

const untrustedAsNull = (
    cached: z.output<typeof cachedSchema> | null,
): z.output<typeof cachedSchema> | null =>
    cached !== null && trusted(cached) ? cached : null;

/**
 * Isolated: answers reads from, and applies writes to, local storage.
 * @returns A function that stops serving.
 */
export const serveChunkCache = (): (() => void) => {
    const onMessage = (event: MessageEvent): void => {
        const data = dataOf(event);
        const read = decodeOr(readSchema, data);

        if (read !== null) {
            void Result.try(
                storage(() => chrome.storage.local.get(STORAGE_KEY)),
            ).then((stored) => {
                postMessage(
                    {
                        cached: stored.isOk()
                            ? untrustedAsNull(
                                  decodeOr(
                                      cachedSchema,
                                      stored.value[STORAGE_KEY],
                                  ),
                              )
                            : null,
                        channel: GENIUS_CHANNEL,
                        direction: ANSWER,
                        id: read.id,
                    },
                    location.origin,
                );
            });
            return;
        }

        const write = decodeOr(writeSchema, data);

        if (write !== null && trusted(write.cached)) {
            void Result.try(
                storage(() =>
                    chrome.storage.local.set({ [STORAGE_KEY]: write.cached }),
                ),
            );
        }
    };

    addEventListener("message", onMessage);

    return () => {
        removeEventListener("message", onMessage);
    };
};

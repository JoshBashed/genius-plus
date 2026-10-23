/** The `postMessage` channel between the two Genius content scripts. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { decodeFailureSchema, decodeOr } from "@/utilities/decode";
import {
    httpErrorSchema,
    type NetworkError,
    networkErrorSchema,
} from "@/utilities/http";
import {
    answerSchema,
    type DeliveryError,
    type ErrorMap,
    requestCredits,
    reviveResult,
} from "@/utilities/messaging";

export const GENIUS_CHANNEL = "genius-plus:genius";

/** What the main half reports back, purely so it can be logged once. */
const statusSchema = z.enum([
    /** The main half is listening; resend the settings. */
    "ready",
    /** Table mounted. */
    "rendered",
    /** Table removed, because the switch went off or we navigated away. */
    "removed",
    /** A Genius album page, but the legacy A/B variant of it. */
    "legacy",
    /** Not an album page, so there is nothing for us to do. */
    "skipped",
    /** Something we expected to be there was not. */
    "failed",
]);

export type GeniusStatus = z.output<typeof statusSchema>;

/** Same window only; Genius embeds chatty iframes. */
const dataOf = (event: MessageEvent): unknown =>
    event.source === window ? event.data : null;

/** One message on this channel, going the given way. */
const onChannel = <Direction extends string, Shape extends z.ZodRawShape>(
    direction: Direction,
    shape: Shape,
) =>
    z.object({
        ...shape,
        channel: z.literal(GENIUS_CHANNEL),
        direction: z.literal(direction),
    });

const enabledSchema = onChannel("to-main", { enabled: z.boolean() });

const statusReportSchema = onChannel("to-isolated", {
    detail: z.string().nullish(),
    status: statusSchema,
});

/** Isolated → main: whether the feature is switched on. */
export const postEnabled = (enabled: boolean): void => {
    postMessage(
        { channel: GENIUS_CHANNEL, direction: "to-main", enabled },
        location.origin,
    );
};

export const readEnabled = (event: MessageEvent): boolean | null =>
    decodeOr(enabledSchema, dataOf(event))?.enabled ?? null;

export interface StatusReport {
    readonly status: GeniusStatus;
    readonly detail: string | null;
}

/** Main → isolated: one line of diagnostics. */
export const postStatus = (
    status: GeniusStatus,
    detail: string | null = null,
): void => {
    postMessage(
        { channel: GENIUS_CHANNEL, direction: "to-isolated", status, detail },
        location.origin,
    );
};

export const readStatus = (event: MessageEvent): StatusReport | null => {
    const report = decodeOr(statusReportSchema, dataOf(event));

    return report === null
        ? null
        : { detail: report.detail ?? null, status: report.status };
};

/**
 * Asking the worker for a page, from the world that cannot reach it.
 *
 * The main half has the page's React but no `chrome.*`, and Apple
 * answers a cross origin read with a 403, so a fetch has to go main to
 * isolated to worker and back.
 */
const REQUEST = "to-isolated-fetch";
const ANSWER = "to-main-fetch";

/** What the worker answered with, or this channel's own timeout. */
export type CreditsError =
    | ErrorMap["apple:credits"]
    | DeliveryError
    | NetworkError;

const requestSchema = onChannel(REQUEST, {
    id: z.number(),
    storefront: z.string(),
    trackId: z.number(),
});

const answerMessageSchema = onChannel(ANSWER, {
    id: z.number(),
    result: answerSchema(
        z.unknown(),
        z.union([
            networkErrorSchema,
            httpErrorSchema,
            decodeFailureSchema,
            z.object({ kind: z.literal("no-receiver") }),
        ]),
    ),
});

/** Counted, not random: only uniqueness within one document matters. */
let nextId = 0;

const waiting = new Map<
    number,
    (result: Result<unknown, CreditsError>) => void
>();

/** Long enough for a slow page, short enough to stop a caller hanging. */
const FETCH_TIMEOUT_MS = 20_000;

let listening = false;

const listenForAnswers = (): void => {
    if (listening) {
        return;
    }

    listening = true;
    addEventListener("message", (event) => {
        const answer = decodeOr(answerMessageSchema, dataOf(event));

        if (answer === null) {
            return;
        }

        const { id, result } = answer;
        const settle = waiting.get(id);

        if (settle === undefined) {
            return;
        }

        waiting.delete(id);
        settle(reviveResult(result));
    });
};

/**
 * Main → isolated: ask the worker for one song's credits.
 *
 * The main half has the page's React but no `chrome.*`, and Apple's
 * catalogue wants a token and no CORS, so the request goes main to
 * isolated to worker and the answer comes back the same way.
 */
export const fetchSongCredits = (
    storefront: string,
    trackId: number,
): Promise<Result<unknown, CreditsError>> => {
    listenForAnswers();

    const id = nextId;
    nextId += 1;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            waiting.delete(id);
            resolve(Result.err({ kind: "network", url: "apple:credits" }));
        }, FETCH_TIMEOUT_MS);

        waiting.set(id, (result) => {
            clearTimeout(timer);
            resolve(result);
        });

        postMessage(
            {
                channel: GENIUS_CHANNEL,
                direction: REQUEST,
                id,
                storefront,
                trackId,
            },
            location.origin,
        );
    });
};

/**
 * Isolated: answers those requests, and nothing else.
 * @returns A function that stops answering.
 */
export const serveCreditRequests = (): (() => void) => {
    const onRequest = (event: MessageEvent): void => {
        const request = decodeOr(requestSchema, dataOf(event));

        if (request === null) {
            return;
        }

        const { id, storefront, trackId } = request;

        void requestCredits(storefront, trackId).then((result) => {
            postMessage(
                {
                    channel: GENIUS_CHANNEL,
                    direction: ANSWER,
                    id,
                    result: result.isOk()
                        ? { type: "ok", value: result.value }
                        : { type: "err", error: result.error },
                },
                location.origin,
            );
        });
    };

    addEventListener("message", onRequest);

    return () => {
        removeEventListener("message", onRequest);
    };
};

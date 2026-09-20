/** The `postMessage` channel between the two Genius content scripts. */
import { Result, type ResultBase } from "@resulted/results";
import type { NetworkError } from "@/utilities/http";
import type { DeliveryError, ErrorMap } from "@/utilities/messaging";
import { reviveResult, sendMessage } from "@/utilities/messaging";

export const GENIUS_CHANNEL = "genius-plus:genius";

/** What the main half reports back, purely so it can be logged once. */
export type GeniusStatus =
    /** The main half is listening; resend the settings. */
    | "ready"
    /** Table mounted. */
    | "rendered"
    /** Table removed, because the switch went off or we navigated away. */
    | "removed"
    /** A Genius album page, but the legacy A/B variant of it. */
    | "legacy"
    /** Not an album page, so there is nothing for us to do. */
    | "skipped"
    /** Something we expected to be there was not. */
    | "failed";

interface Envelope {
    readonly channel: string;
    readonly direction: string;
}

const envelopeOf = (event: MessageEvent): Envelope | null => {
    // Same-window, same-origin only; Genius embeds chatty iframes.
    if (event.source !== window || typeof event.data !== "object") {
        return null;
    }

    const data = event.data as Partial<Envelope> | null;

    if (data === null || data.channel !== GENIUS_CHANNEL) {
        return null;
    }

    return typeof data.direction === "string"
        ? { channel: data.channel, direction: data.direction }
        : null;
};

/** Isolated → main: whether the feature is switched on. */
export const postEnabled = (enabled: boolean): void => {
    postMessage(
        { channel: GENIUS_CHANNEL, direction: "to-main", enabled },
        location.origin,
    );
};

export const readEnabled = (event: MessageEvent): boolean | null => {
    const envelope = envelopeOf(event);

    if (envelope === null || envelope.direction !== "to-main") {
        return null;
    }

    const { enabled } = event.data as { enabled?: unknown };
    return typeof enabled === "boolean" ? enabled : null;
};

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
    const envelope = envelopeOf(event);

    if (envelope === null || envelope.direction !== "to-isolated") {
        return null;
    }

    const { status, detail } = event.data as {
        status?: unknown;
        detail?: unknown;
    };

    if (typeof status !== "string") {
        return null;
    }

    return {
        status: status as GeniusStatus,
        detail: typeof detail === "string" ? detail : null,
    };
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
        const envelope = envelopeOf(event);

        if (envelope === null || envelope.direction !== ANSWER) {
            return;
        }

        const { id, result } = event.data as {
            id?: unknown;
            result?: unknown;
        };

        if (typeof id !== "number") {
            return;
        }

        const settle = waiting.get(id);

        if (settle === undefined) {
            return;
        }

        waiting.delete(id);
        settle(reviveResult(result as ResultBase<unknown, CreditsError>));
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
        const envelope = envelopeOf(event);

        if (envelope === null || envelope.direction !== REQUEST) {
            return;
        }

        const { id, storefront, trackId } = event.data as {
            id?: unknown;
            storefront?: unknown;
            trackId?: unknown;
        };

        if (
            typeof id !== "number" ||
            typeof storefront !== "string" ||
            typeof trackId !== "number"
        ) {
            return;
        }

        void sendMessage({
            storefront,
            trackId,
            type: "apple:credits",
        }).then((result) => {
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

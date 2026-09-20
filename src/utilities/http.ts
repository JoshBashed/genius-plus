/** What a request can fail with, wherever this extension makes one. */

/** A request that never reached the server at all. */
export interface NetworkError {
    readonly kind: "network";
    readonly url: string;
    /**
     * Whatever `fetch` rejected with, when there was anything to say.
     * A blocked request and an unreachable host read the same without
     * it, and they are not fixed the same way.
     */
    readonly reason?: string;
}

/** The server answered, and what it answered was a refusal. */
export interface HttpError {
    readonly kind: "http";
    readonly url: string;
    readonly status: number;
    /**
     * What the server said was wrong, in its own words.
     * Genius puts the only useful line in the body, so a status on
     * its own is never the whole story.
     */
    readonly messages?: readonly string[];
    /**
     * The same refusal, keyed by the field it was about.
     * Their `base` key is what belongs to no field in particular.
     */
    readonly validationErrors?: Readonly<Record<string, readonly string[]>>;
}

/** Either way a request fails: it did not land, or it was refused. */
export type RequestError = NetworkError | HttpError;

/**
 * One line naming what went wrong with a request.
 * @returns The server's own wording whenever it gave any.
 */
export const describeRequestError = (error: RequestError): string => {
    if (error.kind === "network") {
        return error.reason === undefined
            ? `Could not reach ${error.url}`
            : `Could not reach ${error.url}: ${error.reason}`;
    }

    const said = error.messages ?? [];

    if (said.length === 0) {
        return `${error.url} responded ${error.status}`;
    }

    const line = said.join("; ");

    // Their summary is often the status in words, so appending the
    // number again just says it twice.
    return line.includes(String(error.status))
        ? line
        : `${line} (${error.status})`;
};

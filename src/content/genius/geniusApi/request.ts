/** The one way to call Genius's API: its headers, its envelope, a schema. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { configString } from "@/content/genius/pageConfig";
import { type DecodeFailure, decode, decodeOr } from "@/utilities/decode";
import type { HttpError, RequestError } from "@/utilities/http";

/** Genius would reject the write: no usable CSRF token. */
export interface AuthError {
    readonly kind: "auth";
    readonly reason: string;
}

/** A read fails at the wire, at the status, or at the shape. */
export type ReadFailure = RequestError | DecodeFailure;

/** A write can also fail before it is sent, for want of a token. */
export type WriteFailure = AuthError | ReadFailure;

/** Genius asked every extension to name itself on each request it sends. */
export const EXTENSION_HEADERS = {
    "X-Genius-Extension-Id": "Genius+",
} as const;

/** A `GET`, which cookies authenticate. */
export interface GeniusRead {
    readonly path: string;
    readonly query?: Readonly<Record<string, string>>;
    /** Names the answer in a decode error. */
    readonly what: string;
}

/** A write, which also carries Genius's CSRF token. */
export interface GeniusWrite<Body> {
    readonly method: "POST" | "PUT";
    readonly path: string;
    /** Sent as JSON, with `text_format` beside it. */
    readonly body: Body;
    /** Names the answer in a decode error. */
    readonly what: string;
}

/** Their own root, which is not always this origin's `/api`. */
const apiRootUrl = (): string =>
    configString("apiRootUrl", "api_root_url") ?? `${location.origin}/api`;

/** What their own helpers ask every answer to be rendered as. */
const TEXT_FORMAT = "html,markdown,preview";

/** Genius's own write credential, which its `prepareHeaders` reads too. */
const CSRF_COOKIE = "_csrf_token";

/**
 * What a rejection carries.
 *
 * `errors` speaks about the record, `validation_errors` is keyed by
 * field with `base` for anything belonging to none, and `meta.message`
 * is the summary of last resort.
 */
const problemSchema = z.object({
    meta: z.object({ message: z.string().nullish() }).nullish(),
    response: z
        .object({
            errors: z.array(z.string()).nullish(),
            validation_errors: z
                .record(z.string(), z.array(z.string()))
                .nullish(),
        })
        .nullish(),
});

const envelopeSchema = z.object({
    meta: z.object({ status: z.number().nullish() }).nullish(),
    response: z.unknown(),
});

/** Their field names, as the server spells them. */
export type ValidationErrors = Readonly<Record<string, readonly string[]>>;

/** The server names this field differently from the key it takes. */
const SERVER_FIELDS: Readonly<Record<string, string>> = {
    release_date: "release_date_components",
};

/**
 * A rejection's field errors, under the keys a request body uses.
 * @returns An empty object when it named no field in particular.
 */
const readValidationErrors = (body: unknown): ValidationErrors => {
    const problem = decodeOr(problemSchema, body);
    const found = problem?.response?.validation_errors;

    if (found == null) {
        return {};
    }

    const mapped: Record<string, readonly string[]> = {};

    for (const [field, messages] of Object.entries(found)) {
        mapped[SERVER_FIELDS[field] ?? field] = messages;
    }

    return mapped;
};

/**
 * What the server said was wrong, in its own words.
 * @returns Every line it gave, or empty when it gave none.
 */
const readMessages = (body: unknown): readonly string[] => {
    const problem = decodeOr(problemSchema, body);

    if (problem === null) {
        return [];
    }

    const errors = problem.response?.errors ?? [];

    if (errors.length > 0) {
        return errors;
    }

    const byField = Object.values(
        problem.response?.validation_errors ?? {},
    ).flat();

    if (byField.length > 0) {
        return byField;
    }

    const message = problem.meta?.message;

    return message == null ? [] : [message];
};

/** A refusal, with whatever the body said about it. */
const refusal = (url: string, status: number, body: unknown): HttpError => ({
    kind: "http",
    messages: readMessages(body),
    status,
    url,
    validationErrors: readValidationErrors(body),
});

/** HTTP is 200 either way; the real status lives in `meta.status`. */
const unwrap = (
    url: string,
    body: unknown,
): Result<unknown, HttpError | DecodeFailure> => {
    if (typeof body !== "object" || body === null) {
        return Result.err({
            kind: "decode",
            reason: `${url} was not an object`,
        });
    }

    const envelope = decodeOr(envelopeSchema, body);
    const status = envelope?.meta?.status;
    const response = envelope?.response;

    if (typeof status === "number" && (status < 200 || status >= 300)) {
        return Result.err(refusal(url, status, body));
    }

    if (typeof response !== "object" || response === null) {
        return Result.err({
            kind: "decode",
            reason: `${url} carried no response object`,
        });
    }

    return Result.ok(response);
};

/**
 * Reads the `_csrf_token` cookie Genius signs its writes with.
 * @returns A `Result` carrying the token, or an `auth` error if absent.
 */
export const csrfToken = (): Result<string, AuthError> => {
    for (const part of document.cookie.split(";")) {
        const separator = part.indexOf("=");

        if (separator < 0 || part.slice(0, separator).trim() !== CSRF_COOKIE) {
            continue;
        }

        const raw = part.slice(separator + 1).trim();
        const value = Result.trySync(() => decodeURIComponent(raw));

        if (value.isOk() && value.value !== "") {
            return Result.ok(value.value);
        }
    }

    return Result.err({
        kind: "auth",
        reason: `No ${CSRF_COOKIE} cookie, so Genius would reject the write`,
    });
};

/**
 * Sends a request and unwraps Genius's envelope from the answer.
 * @param emptyIsOk Whether a 2xx with no JSON wrote something.
 */
const send = async (
    url: string,
    init: RequestInit,
    emptyIsOk: boolean,
): Promise<Result<unknown, RequestError | DecodeFailure>> => {
    const response = await Result.try(fetch(url, init));

    if (response.isErr()) {
        return Result.err({ kind: "network", url });
    }

    const text = await Result.try(response.value.text());

    if (text.isErr()) {
        return Result.err({ kind: "network", url });
    }

    const parsed = Result.trySync((): unknown => JSON.parse(text.value));
    const { ok, status } = response.value;

    // Parsed before the status is judged: a rejected call still carries
    // the only line worth showing, and bailing early would drop it.
    if (!ok) {
        return Result.err(
            refusal(url, status, parsed.isOk() ? parsed.value : null),
        );
    }

    if (parsed.isErr()) {
        // A write that answered 2xx with no JSON wrote something, and
        // said nothing; a read with no JSON read nothing.
        return emptyIsOk
            ? Result.ok({})
            : Result.err(refusal(url, status, null));
    }

    return unwrap(url, parsed.value);
};

/**
 * Reads from Genius's API, and reads its answer with `schema`.
 * Only the endpoint modules in this folder call it.
 * @returns The decoded `response`, or why there is none.
 */
export const geniusRead = async <Schema extends z.ZodType>(
    request: GeniusRead,
    schema: Schema,
): Promise<Result<z.output<Schema>, ReadFailure>> => {
    const query = new URLSearchParams(request.query);

    if (!query.has("text_format")) {
        query.set("text_format", TEXT_FORMAT);
    }

    const sent = await send(
        `${apiRootUrl()}${request.path}?${query.toString()}`,
        {
            credentials: "same-origin",
            headers: EXTENSION_HEADERS,
            method: "GET",
        },
        false,
    );

    if (sent.isErr()) {
        return Result.err(sent.error);
    }

    return decode(schema, sent.value, request.what);
};

/**
 * Writes to Genius's API, and reads its answer with `schema`.
 * Only the endpoint modules in this folder call it.
 * @returns The decoded `response`, or why there is none.
 */
export const geniusWrite = async <Body, Schema extends z.ZodType>(
    request: GeniusWrite<Body>,
    schema: Schema,
): Promise<Result<z.output<Schema>, WriteFailure>> => {
    const token = csrfToken();

    if (token.isErr()) {
        return token;
    }

    const sent = await send(
        `${apiRootUrl()}${request.path}`,
        {
            // Their own helper merges `text_format` into every write, and
            // the serializer that renders the answer needs it.
            body: JSON.stringify(
                Object.assign({ text_format: TEXT_FORMAT }, request.body),
            ),
            credentials: "same-origin",
            headers: {
                ...EXTENSION_HEADERS,
                "Content-Type": "application/json",
                "X-CSRF-Token": token.value,
            },
            method: request.method,
        },
        true,
    );

    if (sent.isErr()) {
        return Result.err(sent.error);
    }

    return decode(schema, sent.value, request.what);
};

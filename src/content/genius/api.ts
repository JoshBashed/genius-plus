/** Genius's own API calls: `GET` unauthenticated, `PUT` with its CSRF header. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { type DecodeFailure, decodeOr } from "@/utilities/decode";
import type { HttpError, RequestError } from "@/utilities/http";
import { configString } from "./pageConfig";

/** Genius would reject the write: no usable CSRF token. */
export interface AuthError {
    readonly kind: "auth";
    readonly reason: string;
}

/** A read fails at the wire, at the status, or at the shape. */
export type ReadFailure = RequestError | DecodeFailure;

/** A write can also fail before it is sent, for want of a token. */
export type WriteFailure = AuthError | ReadFailure;

/** Their own root, which is not always this origin's `/api`. */
export const apiRootUrl = (): string =>
    configString("apiRootUrl", "api_root_url") ?? `${location.origin}/api`;

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
export const readValidationErrors = (body: unknown): ValidationErrors => {
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

/** HTTP is 200 either way; the real status lives in `meta.status`. */
const unwrap = (
    url: string,
    body: unknown,
): Result<Record<string, unknown>, HttpError | DecodeFailure> => {
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
        return Result.err({
            kind: "http",
            messages: readMessages(body),
            status,
            url,
            validationErrors: readValidationErrors(body),
        });
    }

    if (typeof response !== "object" || response === null) {
        return Result.err({
            kind: "decode",
            reason: `${url} carried no response object`,
        });
    }

    return Result.ok(response as Record<string, unknown>);
};

/** Cookies authenticate; their helper sets no headers, so nor do we. */
export const apiGet = async (
    path: string,
    params: Readonly<Record<string, string>> = {},
): Promise<Result<Record<string, unknown>, ReadFailure>> => {
    const query = new URLSearchParams(params);

    if (!query.has("text_format")) {
        query.set("text_format", "html,markdown,preview");
    }

    const url = `${apiRootUrl()}${path}?${query.toString()}`;
    const response = await Result.try(
        fetch(url, { method: "GET", credentials: "same-origin" }),
    );

    if (response.isErr()) {
        return Result.err({ kind: "network", url });
    }

    const text = await Result.try(response.value.text());

    if (text.isErr()) {
        return Result.err({ kind: "network", url });
    }

    const parsed = Result.trySync(() => JSON.parse(text.value) as unknown);

    // Parsed before the status is judged: a rejected call still carries
    // the only line worth showing, and bailing early would drop it.
    if (!response.value.ok || parsed.isErr()) {
        return Result.err({
            kind: "http",
            messages: parsed.isOk() ? readMessages(parsed.value) : [],
            status: response.value.status,
            url,
            validationErrors: parsed.isOk()
                ? readValidationErrors(parsed.value)
                : {},
        });
    }

    return unwrap(url, parsed.value);
};

/** What their own POST and PUT helpers ask every answer to be rendered as. */
const TEXT_FORMAT = "html,markdown,preview";

/** Genius's own write credential, which its `prepareHeaders` reads too. */
const CSRF_COOKIE = "_csrf_token";

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

/** Both writes send the same headers and read the same answer shape. */
const sendWrite = async (
    method: "POST" | "PUT",
    path: string,
    body: object,
): Promise<Result<Record<string, unknown>, WriteFailure>> => {
    const token = csrfToken();

    if (token.isErr()) {
        return token;
    }

    const url = `${apiRootUrl()}${path}`;
    const response = await Result.try(
        fetch(url, {
            method,
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": token.value,
            },
            // Their own helper merges this into every write, and the
            // serializer that renders the answer needs it.
            body: JSON.stringify({ text_format: TEXT_FORMAT, ...body }),
        }),
    );

    if (response.isErr()) {
        return Result.err({ kind: "network", url });
    }

    const text = await Result.try(response.value.text());

    if (text.isErr()) {
        return Result.err({ kind: "network", url });
    }

    const parsed = Result.trySync(() => JSON.parse(text.value) as unknown);

    if (!response.value.ok) {
        return Result.err({
            kind: "http",
            messages: parsed.isOk() ? readMessages(parsed.value) : [],
            status: response.value.status,
            url,
            validationErrors: parsed.isOk()
                ? readValidationErrors(parsed.value)
                : {},
        });
    }

    // A 2xx that carried no JSON wrote something, and said nothing.
    return parsed.isErr() ? Result.ok({}) : unwrap(url, parsed.value);
};

/**
 * `POST` with the same headers, for the endpoints that create.
 * @param body Serialised as JSON; the caller owns its exact shape.
 * @returns A `Result` with the unwrapped response, empty if 2xx carried none.
 */
export const apiPost = async (
    path: string,
    body: object,
): Promise<Result<Record<string, unknown>, WriteFailure>> =>
    sendWrite("POST", path, body);

/**
 * `PUT` with the headers Genius's own mutations send, never retried.
 * @param body Serialised as JSON; the caller owns its exact shape.
 * @returns A `Result` with the unwrapped response, empty if 2xx carried none.
 */
export const apiPut = async (
    path: string,
    body: object,
): Promise<Result<Record<string, unknown>, WriteFailure>> =>
    sendWrite("PUT", path, body);

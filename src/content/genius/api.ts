/** Genius's own API calls: `GET` unauthenticated, `PUT` with its CSRF header. */
import { Result } from "@resulted/results";
import type { AppResult } from "@/utilities/result";

/** The raw globals are snake_case; the camel spelling is post-merge. */
export const apiRootUrl = (): string => {
    const globals = window as {
        __APP_CONFIG__?: unknown;
        __PRELOADED_STATE__?: { config?: unknown };
    };

    const sources = [
        globals.__APP_CONFIG__,
        globals.__PRELOADED_STATE__?.config,
    ];

    for (const source of sources) {
        if (typeof source !== "object" || source === null) {
            continue;
        }

        const config = source as Record<string, unknown>;

        for (const key of ["apiRootUrl", "api_root_url"]) {
            const value = config[key];

            if (typeof value === "string" && value !== "") {
                return value;
            }
        }
    }

    return `${location.origin}/api`;
};

/** HTTP is 200 either way; the real status lives in `meta.status`. */
const unwrap = (
    url: string,
    body: unknown,
): AppResult<Record<string, unknown>> => {
    if (typeof body !== "object" || body === null) {
        return Result.err({
            kind: "decode",
            reason: `${url} was not an object`,
        });
    }

    const { meta, response } = body as {
        meta?: unknown;
        response?: unknown;
    };
    const status = (meta as { status?: unknown } | undefined)?.status;

    if (typeof status === "number" && (status < 200 || status >= 300)) {
        return Result.err({ kind: "http", url, status });
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
): Promise<AppResult<Record<string, unknown>>> => {
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

    // Named for what it is, rather than as the decode failure that follows.
    if (!response.value.ok) {
        return Result.err({
            kind: "http",
            url,
            status: response.value.status,
        });
    }

    const parsed = Result.trySync(() => JSON.parse(text.value) as unknown);

    if (parsed.isErr()) {
        return Result.err({
            kind: "http",
            url,
            status: response.value.status,
        });
    }

    return unwrap(url, parsed.value);
};

/** Genius's own write credential, which its `prepareHeaders` reads too. */
const CSRF_COOKIE = "_csrf_token";

/**
 * Reads the `_csrf_token` cookie Genius signs its writes with.
 * @returns A `Result` carrying the token, or an `auth` error if absent.
 */
export const csrfToken = (): AppResult<string> => {
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
 * `PUT` with the headers Genius's own mutations send, never retried.
 * @param body Serialised as JSON; the caller owns its exact shape.
 * @returns A `Result` with the unwrapped response, empty if 2xx carried none.
 */
export const apiPut = async (
    path: string,
    body: unknown,
): Promise<AppResult<Record<string, unknown>>> => {
    const token = csrfToken();

    if (token.isErr()) {
        return token;
    }

    const url = `${apiRootUrl()}${path}`;
    const response = await Result.try(
        fetch(url, {
            method: "PUT",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": token.value,
            },
            body: JSON.stringify(body),
        }),
    );

    if (response.isErr()) {
        return Result.err({ kind: "network", url });
    }

    const text = await Result.try(response.value.text());

    if (text.isErr()) {
        return Result.err({ kind: "network", url });
    }

    if (!response.value.ok) {
        return Result.err({
            kind: "http",
            url,
            status: response.value.status,
        });
    }

    const parsed = Result.trySync(() => JSON.parse(text.value) as unknown);

    return parsed.isErr() ? Result.ok({}) : unwrap(url, parsed.value);
};

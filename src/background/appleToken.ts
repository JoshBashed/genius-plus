/** Apple's public web player token, which their own site ships in its JS. */
import { Result } from "@resulted/results";
import type { DecodeFailure } from "@/utilities/decode";
import type { HttpError, NetworkError } from "@/utilities/http";

const HOME = "https://music.apple.com/";

/** Their entry bundle, whose hash changes with every deploy. */
const BUNDLE = /src="(\/assets\/index~[A-Za-z0-9]+\.js)"/;

/** A JWT, of which their bundle carries a few. */
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

/** Their web player's own key id, which names the one we want. */
const WEB_PLAY = "WebPlayKid";

/** Refreshed this long before it expires, rather than on a failure. */
const EXPIRY_MARGIN_MS = 60 * 60 * 1000;

interface CachedToken {
    readonly token: string;
    /** Milliseconds, from the JWT's own `exp`. */
    readonly expires: number;
}

let cached: CachedToken | null = null;

const decodeSegment = (segment: string): Record<string, unknown> | null => {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Result.trySync(() => JSON.parse(atob(padded)) as unknown);

    return decoded.isOk() && typeof decoded.value === "object"
        ? (decoded.value as Record<string, unknown>)
        : null;
};

const expiryOf = (token: string): number => {
    const payload = token.split(".")[1];
    const claims = payload === undefined ? null : decodeSegment(payload);
    const exp = claims?.exp;

    return typeof exp === "number" ? exp * 1000 : 0;
};

const fetchText = async (
    url: string,
): Promise<Result<string, NetworkError | HttpError>> => {
    const response = await Result.try(fetch(url, { credentials: "omit" }));

    if (response.isErr()) {
        return Result.err({ kind: "network", url });
    }

    if (!response.value.ok) {
        return Result.err({
            kind: "http",
            status: response.value.status,
            url,
        });
    }

    const text = await Result.try(response.value.text());

    return text.isErr() ? Result.err({ kind: "network", url }) : text;
};

/**
 * Reads the token out of their own page, and keeps it until it expires.
 *
 * It is a public key their web player ships to every visitor, embedded
 * as a literal in the entry bundle rather than served by an endpoint, so
 * finding it means reading that bundle. It is cached because the bundle
 * is several megabytes and the token lasts weeks.
 */
export const appleToken = async (
    now: number,
): Promise<Result<string, NetworkError | HttpError | DecodeFailure>> => {
    if (cached !== null && cached.expires - EXPIRY_MARGIN_MS > now) {
        return Result.ok(cached.token);
    }

    const home = await fetchText(HOME);

    if (home.isErr()) {
        return home;
    }

    const asset = BUNDLE.exec(home.value)?.[1];

    if (asset === undefined) {
        return Result.err({
            kind: "decode",
            reason: "music.apple.com no longer names an entry bundle we know",
        });
    }

    const bundle = await fetchText(new URL(asset, HOME).href);

    if (bundle.isErr()) {
        return bundle;
    }

    for (const match of bundle.value.matchAll(JWT)) {
        const token = match[0];
        const header = token.split(".")[0];
        const claims = header === undefined ? null : decodeSegment(header);

        if (claims?.kid !== WEB_PLAY) {
            continue;
        }

        cached = { expires: expiryOf(token), token };
        return Result.ok(token);
    }

    return Result.err({
        kind: "decode",
        reason: "their bundle carried no web player token",
    });
};

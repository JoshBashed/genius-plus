/** Uploading art the way Genius's own picker does, through Filestack. */
import { Result } from "@resulted/results";
import { z } from "zod";
import { decode } from "@/utilities/decode";
import { configString } from "../pageConfig";

/** Their store API, of which only the S3 location is ever used. */
const STORE_URL = "https://www.filepicker.io/api/store/S3";

/** The field `filepicker.js` posts under, so their server reads it. */
const FIELD = "fileUpload";

/** What their own library sends, and what their logs expect to see. */
const PLUGIN = "js_lib";

/** The credentials Genius renders for its own picker. */
export interface FilepickerConfig {
    readonly apiKey: string;
    /** Signed, minted per render, and good for seven days. */
    readonly policy: string;
    readonly signature: string;
    /** The directory the policy's own `path` confines an upload to. */
    readonly path: string;
    readonly cdnDomain: string;
}

/**
 * Every way putting one image on Filestack fails.
 *
 * Flat by design: nothing here forwards a lower layer's error, and each
 * variant carries only what its own line has to say.
 */
export type FilepickerFailure =
    /** The page carries no credentials, which a signed out one does not. */
    | { readonly kind: "unconfigured"; readonly missing: string }
    /** It never reached Filestack. */
    | { readonly kind: "networkError" }
    /** Filestack answered, and what it answered was a refusal. */
    | { readonly kind: "refused"; readonly status: number }
    /** Filestack took it and said something that is not a stored file. */
    | { readonly kind: "unreadable"; readonly reason: string };

/** One line naming why an image was not uploaded. */
export const describeFilepickerFailure = (error: FilepickerFailure): string => {
    switch (error.kind) {
        case "unconfigured":
            return `This page carries no ${error.missing} to upload with`;
        case "networkError":
            return "Could not reach Filestack";
        case "refused":
            return `Filestack answered ${error.status}`;
        case "unreadable":
            return `Filestack answered with ${error.reason}`;
    }
};

/**
 * The picker's credentials, which only a signed in render carries.
 * @returns Every field, or the name of the first one missing.
 */
export const readFilepickerConfig = (): Result<
    FilepickerConfig,
    FilepickerFailure
> => {
    const apiKey = configString("filepickerApiKey", "filepicker_api_key");
    const policy = configString("filepickerPolicy", "filepicker_policy");
    const signature = configString(
        "filepickerSignature",
        "filepicker_signature",
    );
    const path = configString("filepickerPath", "filepicker_path");
    const cdnDomain = configString(
        "filepickerCdnDomain",
        "filepicker_cdn_domain",
    );

    if (apiKey === null) {
        return Result.err({ kind: "unconfigured", missing: "Filestack key" });
    }

    if (policy === null || signature === null) {
        return Result.err({
            kind: "unconfigured",
            missing: "signed Filestack policy",
        });
    }

    if (path === null || cdnDomain === null) {
        return Result.err({
            kind: "unconfigured",
            missing: "Filestack upload path",
        });
    }

    return Result.ok({ apiKey, cdnDomain, path, policy, signature });
};

/** Their own naming: a base36 run under the directory the policy names. */
const storePathUnder = (path: string): string =>
    `${path}/${Math.random().toString(36).slice(2)}`;

/** Only that it stored; the URL we serve from is derived, not returned. */
const storedSchema = z.object({ url: z.string() });

/** What their own picker accepts, and what we always send. */
const PNG = "image/png";

/**
 * Stores one image under Genius's own Filestack path.
 *
 * The URL this answers with is an ingest handle: Genius re-hosts what
 * `cover_arts` names, so it only has to be reachable once.
 *
 * @param blob A PNG. Their colour sniffing reads the stored file and
 * gets it wrong on a JPEG, so the type is declared rather than sniffed.
 * @returns The CDN URL the stored file serves from.
 */
export const uploadImage = async (
    blob: Blob,
    filename: string,
): Promise<Result<string, FilepickerFailure>> => {
    const config = readFilepickerConfig();

    if (config.isErr()) {
        return Result.err(config.error);
    }

    const storePath = storePathUnder(config.value.path);
    const query = new URLSearchParams({
        access: "private",
        filename,
        key: config.value.apiKey,
        mimetype: PNG,
        path: storePath,
        plugin: PLUGIN,
        policy: config.value.policy,
        signature: config.value.signature,
    });
    const body = new FormData();

    // The bytes are already a PNG; this only makes the part say so,
    // so what Filestack stores is not typed from a guess.
    body.append(FIELD, blob.slice(0, blob.size, PNG), filename);

    // No credentials: the signed policy is the whole of the auth, and
    // sending cookies cross-site would only cost us the `*` origin.
    const response = await Result.try(
        fetch(`${STORE_URL}?${query.toString()}`, {
            body,
            credentials: "omit",
            method: "POST",
        }),
    );

    if (response.isErr()) {
        return Result.err({ kind: "networkError" });
    }

    if (!response.value.ok) {
        return Result.err({
            kind: "refused",
            status: response.value.status,
        });
    }

    const parsed = await Result.try(response.value.json() as Promise<unknown>);

    if (parsed.isErr()) {
        return Result.err({
            kind: "unreadable",
            reason: "something that is not JSON",
        });
    }

    const stored = decode(storedSchema, parsed.value, "the stored file");

    if (stored.isErr()) {
        return Result.err({
            kind: "unreadable",
            reason: stored.error.reason,
        });
    }

    return Result.ok(
        `https://${config.value.cdnDomain}/${encodeURIComponent(storePath)}`,
    );
};

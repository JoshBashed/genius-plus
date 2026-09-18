import { Result } from "@resulted/results";
import { IMAGE_CDN_MATCHES } from "@/manifest";
import { onMessage } from "@/utilities/messaging";

/** The image CDNs only. The worker is not an open proxy. */
const ALLOWED_HOSTS = /^(?:[a-z0-9-]+\.)?(mzstatic|sndcdn)\.com$/i;

const isAllowed = (raw: string): boolean => {
    try {
        const url = new URL(raw);
        return url.protocol === "https:" && ALLOWED_HOSTS.test(url.host);
    } catch {
        return false;
    }
};

/** `FileReader` does not exist in a worker, so base64 is done by hand. */
const encodeBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
};

onMessage({
    "image:fetch": async ({ url }) => {
        if (!isAllowed(url)) {
            return Result.err({
                kind: "unsupported",
                reason: `${url} is not a permitted image host`,
            });
        }

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

        const buffer = await Result.try(response.value.arrayBuffer());

        if (buffer.isErr()) {
            return Result.err({ kind: "network", url });
        }

        const type = response.value.headers.get("content-type") ?? "image/jpeg";

        return Result.ok(`data:${type};base64,${encodeBase64(buffer.value)}`);
    },
});

chrome.runtime.onInstalled.addListener(() => {
    console.info(
        "[genius+] ready, relaying images for",
        IMAGE_CDN_MATCHES.join(", "),
    );
});

/** Which chunk exports each named component, read in a frame thrown away. */
import { Result } from "@resulted/results";
import { z } from "zod";
import type { BindingError } from "@/bindings/errors";
import { normaliseDisplayName } from "@/bindings/finders";
import { decode } from "@/utilities/decode";

/** Long enough for a slow connection to fetch every chunk once. */
const INDEX_TIMEOUT_MS = 20_000;

/**
 * What the frame reports. Decoding it copies it into this realm, so
 * nothing kept here holds the removed frame, and its modules, alive.
 */
const chunkNamesSchema = z.object({
    failed: z.array(z.string()),
    names: z.record(z.string(), z.array(z.string())),
});

type ChunkNames = z.output<typeof chunkNamesSchema>;

/** Which chunks export each component, and which could not be read. */
export interface ExportIndex {
    readonly exports: ReadonlyMap<string, readonly string[]>;
    /** Chunks that failed to import, whose names a retry may still find. */
    readonly failed: readonly string[];
}

const indexError = (reason: string): BindingError => ({
    kind: "binding",
    target: "Genius's component index",
    reason,
});

/**
 * Runs in the frame: imports every chunk and names what each exports.
 * Mirrors `displayNameOf`, since nothing can be imported into the frame.
 */
const frameScript = (
    chunks: readonly (readonly [string, string])[],
    callback: string,
): string => `
const nameOf = (value) => {
    if (typeof value !== "object" && typeof value !== "function") return null;
    if (value === null) return null;
    if (typeof value.displayName === "string") return value.displayName;
    const inner = value.type ?? value.render;
    return typeof inner?.displayName === "string" ? inner.displayName : null;
};
const chunks = ${JSON.stringify(chunks)};
const names = {};
const failed = [];
await Promise.all(chunks.map(async ([base, url]) => {
    try {
        const ns = await Promise.race([
            import(url),
            new Promise((_, reject) => setTimeout(reject, 10000)),
        ]);
        names[base] = Object.values(ns).map(nameOf).filter((name) => name !== null);
    } catch {
        failed.push(base);
    }
}));
window[${JSON.stringify(callback)}]({ names, failed });
`;

/** Reads every chunk's exported display names in a throwaway frame. */
const readNames = (
    urls: ReadonlyMap<string, string>,
): Promise<Result<ChunkNames, BindingError>> => {
    const origins = [
        ...new Set([...urls.values()].map((url) => new URL(url).origin)),
    ];
    const nonce = crypto.randomUUID();
    const callback = `genius-plus:${nonce}`;
    const frame = document.createElement("iframe");

    frame.hidden = true;
    // Same origin, so their modules can load, but never able to navigate
    // this page, open a window, or submit a form.
    frame.sandbox.add("allow-scripts", "allow-same-origin");
    // Their modules may load and run, but may not reach the network or
    // touch this page: no fetches, no images, no other script hosts.
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${origins.join(" ")} 'nonce-${nonce}'">`;

    return new Promise((resolve) => {
        const settle = (outcome: Result<ChunkNames, BindingError>): void => {
            clearTimeout(timer);
            frame.remove();
            resolve(outcome);
        };

        const timer = setTimeout(() => {
            settle(Result.err(indexError("the chunks did not load in time")));
        }, INDEX_TIMEOUT_MS);

        frame.addEventListener("load", () => {
            const inner = frame.contentWindow;
            const doc = frame.contentDocument;

            if (inner === null || doc === null) {
                settle(Result.err(indexError("the frame did not open")));
                return;
            }

            Reflect.set(inner, callback, (raw: unknown) => {
                settle(
                    decode(chunkNamesSchema, raw, "the component index").mapErr(
                        (failure) => indexError(failure.reason),
                    ),
                );
            });

            // Our own script refused means nothing will ever answer, so
            // stop now rather than at the timeout. Their blocked scripts
            // from other hosts are expected, and are not this.
            doc.addEventListener("securitypolicyviolation", (event) => {
                if (event.blockedURI === "inline") {
                    settle(
                        Result.err(indexError("the frame refused its script")),
                    );
                }
            });

            const script = doc.createElement("script");
            script.type = "module";
            script.nonce = nonce;
            script.textContent = frameScript([...urls], callback);
            doc.head.append(script);
        });

        document.documentElement.append(frame);
    });
};

/**
 * Maps each component's display name to the chunks exporting it.
 * @param into An earlier index to add to, for a retry of failed chunks.
 * @returns Names unwrapped the way `findByDisplayName` reads them.
 */
export const indexExports = async (
    urls: ReadonlyMap<string, string>,
    into: ReadonlyMap<string, readonly string[]> = new Map(),
): Promise<Result<ExportIndex, BindingError>> => {
    const read = await readNames(urls);

    if (read.isErr()) {
        return read;
    }

    const index = new Map<string, string[]>(
        [...into].map(([name, bases]) => [name, [...bases]]),
    );

    for (const [base, names] of Object.entries(read.value.names)) {
        for (const name of names) {
            const key = normaliseDisplayName(name);
            const bases = index.get(key) ?? [];

            if (!bases.includes(base)) {
                bases.push(base);
            }

            index.set(key, bases);
        }
    }

    return Result.ok({ exports: index, failed: read.value.failed });
};

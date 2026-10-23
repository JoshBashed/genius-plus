/** Finds Genius's bundles by name, from the page that loads all of them. */
import { Result } from "@resulted/results";
import {
    type ChunkIndex,
    detectPage,
    readChunkIndex,
    resolveChunk,
    resolveChunkMatching,
} from "@/bindings/discovery";
import type { BindingError } from "@/bindings/errors";
import { findByDisplayName } from "@/bindings/finders";
import type { ModuleNamespace } from "@/bindings/types";
import { EXTENSION_HEADERS } from "@/content/genius/geniusApi";
import {
    type CachedChunks,
    readChunkCache,
    writeChunkCache,
} from "@/content/genius/utilities/chunkCache";
import {
    type ExportIndex,
    indexExports,
} from "@/content/genius/utilities/exportIndex";

/**
 * About Genius, by id so a renamed slug still redirects to it.
 * A song page carries the metadata form, so it loads every bundle we use.
 */
const DONOR_PATH = "/songs/474187";

/** The donor, as an error names it. */
const DONOR_NAME = "About Genius";

/** How long a cached list is trusted before the donor is read again. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** The bundle every other one imports React from; a React page has it. */
const VENDOR = "react-vendor";

const linkError = (reason: string): BindingError => ({
    kind: "binding",
    target: "Genius's bundles",
    reason,
});

/** This page's chunks, and the origin Genius serves its chunks from. */
interface PageChunks {
    readonly chunks: ChunkIndex;
    readonly origin: string;
}

/** The page's own chunks, which a list has to agree with to be its build. */
const pageChunks = (): Result<PageChunks, BindingError> => {
    const page = detectPage();

    if (page.isErr() || page.value.kind !== "react") {
        return Result.err(linkError("this page does not run Genius's React"));
    }

    const vendor = page.value.chunks.urls.get(VENDOR);

    return vendor === undefined
        ? Result.err(linkError(`this page loads no ${VENDOR}`))
        : Result.ok({
              chunks: page.value.chunks,
              origin: new URL(vendor).origin,
          });
};

/**
 * Whether a list is this page's build: it has the page's own React, and
 * each chunk both name has one URL. A list with no React is not a build.
 */
const sameBuild = (
    page: ChunkIndex,
    urls: ReadonlyMap<string, string>,
): boolean =>
    urls.get(VENDOR) === page.urls.get(VENDOR) &&
    [...page.urls].every(
        ([base, url]) =>
            page.duplicates.has(base) ||
            !urls.has(base) ||
            urls.get(base) === url,
    );

/** Whether a cached list is young enough, and not from the future. */
const fresh = (savedAt: number): boolean => {
    const age = Date.now() - savedAt;
    return age >= 0 && age < CACHE_TTL_MS;
};

/**
 * Reads the donor page's chunks, keeping only Genius's own.
 * A module script from another host is not a bundle, and must never be
 * imported or cached.
 */
const readDonor = async (
    origin: string,
): Promise<Result<ChunkIndex, BindingError>> => {
    const response = await Result.try(
        fetch(DONOR_PATH, {
            credentials: "same-origin",
            headers: EXTENSION_HEADERS,
        }),
    );

    if (response.isErr() || !response.value.ok) {
        return Result.err(linkError(`could not read ${DONOR_PATH}`));
    }

    const html = await Result.try(response.value.text());

    if (html.isErr()) {
        return Result.err(linkError(`could not read ${DONOR_PATH}`));
    }

    const read = readChunkIndex(html.value);
    const own = (url: string): boolean => new URL(url).origin === origin;

    return Result.ok({
        duplicates: read.duplicates,
        entries: read.entries.filter(own),
        urls: new Map([...read.urls].filter(([, url]) => own(url))),
    });
};

/**
 * The chunks worth indexing: not the page's entry scripts, which boot
 * their whole app, and not names two chunks share.
 */
const indexable = (chunks: ChunkIndex): ReadonlyMap<string, string> => {
    const entries = new Set(chunks.entries);

    return new Map(
        [...chunks.urls].filter(
            ([base, url]) => !entries.has(url) && !chunks.duplicates.has(base),
        ),
    );
};

/** No index yet: every chunk is one a lookup may still have to read. */
const unindexed = (chunks: ChunkIndex): ExportIndex => ({
    exports: new Map(),
    failed: [...indexable(chunks).keys()],
});

/** The donor's chunks, when they were read, and their index once built. */
interface Linked {
    readonly chunks: ChunkIndex;
    readonly savedAt: number;
    /** Built in the background; only lookups by display name wait for it. */
    readonly index: Promise<ExportIndex>;
}

/** Links one document to Genius's bundles. */
export class JSLinker {
    static #shared: JSLinker | null = null;

    /** The linker for this document. */
    static shared = (): JSLinker => {
        JSLinker.#shared ??= new JSLinker();
        return JSLinker.#shared;
    };

    /** The donor's chunk list, settled once per document. */
    #linked: Promise<Result<Linked, BindingError>> | null = null;

    /**
     * Set when this tab is older than Genius's current build. Kept for the
     * document, since nothing short of a reload can fix it.
     */
    #outdated: BindingError | null = null;

    /** The one retry of failed chunks this document gets, once started. */
    #retrying: Promise<ExportIndex> | null = null;

    /** Imported namespaces, by URL, so a bundle is imported once. */
    #loaded = new Map<string, Promise<Result<ModuleNamespace, BindingError>>>();

    /**
     * Loads a bundle by its file name, hash stripped, such as `"Button"`.
     * @returns Its module namespace, or why it could not be linked.
     */
    findAndLoadBundleByName = async (
        name: string,
    ): Promise<Result<ModuleNamespace, BindingError>> => {
        const linked = await this.#chunks();

        if (linked.isErr()) {
            return linked;
        }

        const url = resolveChunk(linked.value.chunks, name, DONOR_NAME);
        return url.isOk() ? this.#load(url.value) : url;
    };

    /**
     * Loads whichever bundle exports the component with this display name.
     * @param own The bundle it lives in unless Genius moved it.
     * @returns The namespace holding it, or why none could be linked.
     */
    findAndLoadBundleExporting = async (
        name: string,
        own: string = name,
    ): Promise<Result<ModuleNamespace, BindingError>> => {
        const linked = await this.#chunks();

        if (linked.isErr()) {
            return linked;
        }

        // Its own bundle first, which needs no index: only a component
        // Genius has moved waits for the index to be built.
        const direct = await this.findAndLoadBundleByName(own);

        if (direct.isOk() && findByDisplayName(direct.value, name).isOk()) {
            return direct;
        }

        const index = await linked.value.index;
        const exports = index.exports.has(name)
            ? index.exports
            : (await this.#retryFailed(linked.value, index)).exports;

        // The index can be a day old, so the chunk whose exports carry the
        // name today is the answer.
        for (const base of exports.get(name) ?? []) {
            const url = linked.value.chunks.urls.get(base);
            const ns = url === undefined ? null : await this.#load(url);

            if (
                ns?.isOk() === true &&
                findByDisplayName(ns.value, name).isOk()
            ) {
                return ns;
            }
        }

        return direct;
    };

    /**
     * The same, for a bundle whose file name is likely to drift.
     * @param target Named in the error when nothing matches.
     */
    findAndLoadBundleMatching = async (
        pattern: RegExp,
        target: string,
    ): Promise<Result<ModuleNamespace, BindingError>> => {
        const linked = await this.#chunks();

        if (linked.isErr()) {
            return linked;
        }

        const url = resolveChunkMatching(
            linked.value.chunks,
            pattern,
            target,
            DONOR_NAME,
        );
        return url.isOk() ? this.#load(url.value) : url;
    };

    /** Forgets imported namespaces; the chunk list stays for the document. */
    reset = (): void => {
        this.#loaded.clear();
    };

    /** Saves a list and its index, for every tab on the same build. */
    #save = (linked: Linked, index: ExportIndex): void => {
        const cached: CachedChunks = {
            duplicates: linked.chunks.duplicates,
            exports: index.exports,
            failed: index.failed,
            savedAt: linked.savedAt,
            urls: linked.chunks.urls,
        };

        writeChunkCache(cached);
    };

    /**
     * Indexes the chunks that failed last time, once per document.
     * @returns The index with whatever they export added to it.
     */
    #retryFailed = (
        linked: Linked,
        index: ExportIndex,
    ): Promise<ExportIndex> => {
        this.#retrying ??= (async () => {
            const failed = new Map(
                index.failed.flatMap((base) => {
                    const url = linked.chunks.urls.get(base);
                    return url === undefined ? [] : [[base, url] as const];
                }),
            );

            if (failed.size === 0) {
                return index;
            }

            const retried = await indexExports(failed, index.exports);

            if (retried.isErr()) {
                return index;
            }

            this.#linked = Promise.resolve(
                Result.ok({ ...linked, index: Promise.resolve(retried.value) }),
            );
            this.#save(linked, retried.value);

            return retried.value;
        })();

        return this.#retrying;
    };

    #chunks = (): Promise<Result<Linked, BindingError>> => {
        if (this.#outdated !== null) {
            return Promise.resolve(Result.err(this.#outdated));
        }

        this.#linked ??= this.#link().then((linked) => {
            // A failure is not kept, so the next lookup tries again.
            if (linked.isErr()) {
                this.#linked = null;
            }

            return linked;
        });

        return this.#linked;
    };

    /**
     * The cached list while it is fresh and this page's build, otherwise
     * the donor's, which replaces the cache once its index is built.
     */
    #link = async (): Promise<Result<Linked, BindingError>> => {
        const page = pageChunks();

        if (page.isErr()) {
            return page;
        }

        const cached = await readChunkCache();

        if (
            cached !== null &&
            fresh(cached.savedAt) &&
            sameBuild(page.value.chunks, cached.urls)
        ) {
            return Result.ok({
                chunks: {
                    duplicates: cached.duplicates,
                    entries: [],
                    urls: cached.urls,
                },
                index: Promise.resolve({
                    exports: cached.exports,
                    failed: cached.failed,
                }),
                savedAt: cached.savedAt,
            });
        }

        const donor = await readDonor(page.value.origin);

        if (donor.isErr()) {
            return donor;
        }

        // A page listing no React, such as an error or a bot check, is not
        // a chunk list: it is never indexed or cached, and the next lookup
        // reads the donor again.
        if (!donor.value.urls.has(VENDOR)) {
            return Result.err(linkError(`${DONOR_PATH} listed no ${VENDOR}`));
        }

        // Genius shipped a new build since this tab loaded; mixing the two
        // would put second copies of shared modules beside the page's own.
        if (!sameBuild(page.value.chunks, donor.value.urls)) {
            this.#outdated = linkError(
                "reload the page (this tab runs an older Genius build than the one it serves now)",
            );
            return Result.err(this.#outdated);
        }

        const linked: Linked = {
            chunks: donor.value,
            // Without an index, the list is still cached, with every chunk
            // left to read, so a lookup that misses tries again.
            index: indexExports(indexable(donor.value)).then((built) => {
                const index = built.isOk()
                    ? built.value
                    : unindexed(donor.value);
                this.#save(linked, index);
                return index;
            }),
            savedAt: Date.now(),
        };

        return Result.ok(linked);
    };

    /** The identical URL string is what yields the page's own instance. */
    #load = (url: string): Promise<Result<ModuleNamespace, BindingError>> => {
        const existing = this.#loaded.get(url);

        if (existing !== undefined) {
            return existing;
        }

        const pending = importModule(url).then((outcome) => {
            // A transient failure must not poison the URL for the document,
            // nor remove a newer load a reset has since started.
            if (outcome.isErr() && this.#loaded.get(url) === pending) {
                this.#loaded.delete(url);
            }

            return outcome;
        });

        this.#loaded.set(url, pending);
        return pending;
    };
}

/** Any object can be read key by key, each value as `unknown`. */
const isNamespace = (value: unknown): value is ModuleNamespace =>
    typeof value === "object" && value !== null;

const importModule = async (
    url: string,
): Promise<Result<ModuleNamespace, BindingError>> => {
    // Must stay a native `import()` of a runtime string.
    const imported = await Result.try(
        import(/* webpackIgnore: true */ url).then((ns): unknown => ns),
    );

    if (imported.isErr()) {
        return Result.err({
            kind: "binding",
            target: url,
            reason: `import() rejected: ${String(imported.error)}`,
        });
    }

    if (!isNamespace(imported.value)) {
        return Result.err({
            kind: "binding",
            target: url,
            reason: "import() resolved to something that is not a module",
        });
    }

    return Result.ok(imported.value);
};

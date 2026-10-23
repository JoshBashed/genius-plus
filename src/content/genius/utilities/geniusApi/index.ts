/**
 * Genius's own API, one function per endpoint.
 * `request.ts` stays inside this folder, so every call is an endpoint.
 */
export * from "@/content/genius/utilities/geniusApi/albums";
export * from "@/content/genius/utilities/geniusApi/artists";
export {
    type AuthError,
    csrfToken,
    EXTENSION_HEADERS,
    type ReadFailure,
    type ValidationErrors,
    type WriteFailure,
} from "@/content/genius/utilities/geniusApi/request";
export type {
    AlbumRef,
    Ref,
} from "@/content/genius/utilities/geniusApi/schemas";
export * from "@/content/genius/utilities/geniusApi/songs";
export * from "@/content/genius/utilities/geniusApi/tags";

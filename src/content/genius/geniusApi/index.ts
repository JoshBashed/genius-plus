/**
 * Genius's own API, one function per endpoint.
 * `request.ts` stays inside this folder, so every call is an endpoint.
 */
export * from "@/content/genius/geniusApi/albums";
export * from "@/content/genius/geniusApi/artists";
export {
    type AuthError,
    csrfToken,
    EXTENSION_HEADERS,
    type ReadFailure,
    type ValidationErrors,
    type WriteFailure,
} from "@/content/genius/geniusApi/request";
export type { AlbumRef, Ref } from "@/content/genius/geniusApi/schemas";
export * from "@/content/genius/geniusApi/songs";
export * from "@/content/genius/geniusApi/tags";

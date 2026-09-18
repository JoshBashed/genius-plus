/** Per song, per field edit gates, mirroring the song page's own form. */
import type { DraftField } from "./draft";
import type { SongMetadata } from "./metadata";

/**
 * The gate each column reads, taken from `reactSongClient`'s `disabled` props.
 * `rename` covers the fields Genius locks once a song is published.
 */
const FIELD_GATES: Readonly<Record<DraftField, string>> = {
    title: "rename",
    primaryArtists: "rename",
    featuredArtists: "rename",
    writerArtists: "edit",
    producerArtists: "edit",
    releaseDate: "edit",
    language: "edit_tags",
    primaryTagId: "edit_tags",
    tags: "edit_tags",
    soundcloudUrl: "edit_soundcloud_url",
    youtubeUrl: "edit_youtube_url",
};

/** Their credits form only locks the lead credits on a published song. */
const PUBLISHED_ONLY_GATES: readonly DraftField[] = ["primaryArtists"];

/** Adding a value Genius has never seen needs its own gate. */
const CREATE_GATES: Readonly<Partial<Record<DraftField, string>>> = {
    tags: "create_tag",
};

/**
 * Whether the viewer may edit one field of one song.
 * @returns `true` whenever this song's permissions are unknown.
 */
export const canEdit = (metadata: SongMetadata, field: DraftField): boolean => {
    const { permissions } = metadata;

    if (permissions === null) {
        return true;
    }

    if (PUBLISHED_ONLY_GATES.includes(field) && !metadata.published) {
        return true;
    }

    return permissions.includes(FIELD_GATES[field]);
};

/**
 * Whether the viewer may add a value to `field` that Genius has never seen.
 * @returns `true` for fields with no separate creation gate.
 */
export const canCreate = (
    metadata: SongMetadata,
    field: DraftField,
): boolean => {
    const gate = CREATE_GATES[field];
    const { permissions } = metadata;

    return gate === undefined || permissions === null
        ? true
        : permissions.includes(gate);
};

/**
 * Whether Genius told us what this viewer may do to this song.
 * @returns `false` when nothing is gated and the server has the final say.
 */
export const permissionsKnown = (metadata: SongMetadata): boolean =>
    metadata.permissions !== null;

/** The gate name a blocked field needs, for the confirmation's explanation. */
export const gateFor = (field: DraftField): string => FIELD_GATES[field];

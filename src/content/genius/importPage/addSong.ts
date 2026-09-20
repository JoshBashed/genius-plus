/** The hand-off to Genius's own Add A Song page. */

/**
 * Their form, pointed at one Apple track.
 *
 * `apple_id` is theirs: given one, their page renders its prefill step
 * and fills the whole form from that track. Creating the song is left to
 * them, because their endpoint wants a reCAPTCHA token nothing here mints.
 *
 * @param appleTrackId The track to prefill from, or `null` for a blank form.
 */
export const addSongUrl = (appleTrackId: number | null): string =>
    appleTrackId === null ? "/new" : `/new?apple_id=${appleTrackId}`;

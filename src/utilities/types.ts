/** The three sites this extension runs on. */
export type SiteId = "genius" | "soundcloud" | "apple-music";

/** An artwork image the user can pull down at full quality. */
export interface ArtworkTarget {
    /** Candidate URLs, best first; the first that decodes wins. */
    readonly candidates: readonly string[];
    /** Base filename, without extension, already human readable. */
    readonly name: string;
}

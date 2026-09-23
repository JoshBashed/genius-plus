/** The artwork beside a title, which three steps lay out the same way. */

import { type FC, memo, type ReactNode } from "react";
import { appleArtwork } from "@/utilities/appleAlbum";
import type { ImportedAlbum } from "../albumImport/importedAlbum";
import { Media } from "./styles";

/** Artwork big enough for the panel, asked for by filename. */
const ARTWORK = 320;

interface AlbumMediaProps {
    readonly album: ImportedAlbum;
    /** Whatever names the album here: a heading, or a field to edit it. */
    readonly title: ReactNode;
}

const renderAlbumMedia: FC<AlbumMediaProps> = ({ album, title }) => {
    const artwork = appleArtwork(album.artworkUrl, ARTWORK);

    return (
        <Media>
            {artwork === null ? (
                <img alt="" />
            ) : (
                <img alt={`${album.title} artwork`} src={artwork} />
            )}
            <span className="gp-names">
                {title}
                <span className="gp-artists">{album.artistName}</span>
            </span>
        </Media>
    );
};

export const AlbumMedia = memo(renderAlbumMedia);

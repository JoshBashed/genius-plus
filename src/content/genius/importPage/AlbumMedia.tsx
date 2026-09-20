/** The artwork beside a title, which three steps lay out the same way. */
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type PageNode,
} from "@/bindings";
import { appleArtwork } from "@/utilities/appleAlbum";
import type { ImportedAlbum } from "../albumImport/importedAlbum";
import { memo } from "../reactHost/react";
import { Media } from "./styles";

/** Artwork big enough for the panel, asked for by filename. */
const ARTWORK = 320;

interface AlbumMediaProps {
    readonly album: ImportedAlbum;
    /** Whatever names the album here: a heading, or a field to edit it. */
    readonly title: PageNode;
}

const renderAlbumMedia = ({ album, title }: AlbumMediaProps): PageElement => {
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

export const AlbumMedia = memo(
    asPageValue<PageComponent<AlbumMediaProps>>(renderAlbumMedia),
);

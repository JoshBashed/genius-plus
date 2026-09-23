/** Step one: the Apple Music link, and everything read from it. */

import { type FC, memo, useState } from "react";
import {
    describeAppleAlbumFailure,
    fetchAppleAlbum,
    parseAppleAlbumUrl,
} from "@/utilities/appleAlbum";
import {
    type ContributorPlan,
    resolveContributors,
} from "../../albumImport/contributors";
import {
    type ImportedAlbum,
    importedAlbum,
} from "../../albumImport/importedAlbum";
// Deep imports, not the barrel: it evaluates every component, and this
// page binds only the few it renders with.
import { Button } from "../../geniusComponents/Button";
import { Spinner } from "../../geniusComponents/Spinner";
import { TextInput } from "../../geniusComponents/TextInput";
import { Actions, Note, Panel } from "../styles";

export interface AlbumStepProps {
    /** Called once the album and its credits have both been read. */
    readonly onLoaded: (album: ImportedAlbum, artists: ContributorPlan) => void;
}

const renderAlbumStep: FC<AlbumStepProps> = ({ onLoaded }) => {
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);

    const fetchAlbum = (): void => {
        const ref = parseAppleAlbumUrl(url);

        if (ref.isErr()) {
            setNote(ref.error.reason);
            return;
        }

        setBusy(true);
        setNote(null);

        void fetchAppleAlbum(ref.value).then(async (album) => {
            if (album.isErr()) {
                setBusy(false);
                setNote(describeAppleAlbumFailure(album.error));
                return;
            }

            const next = importedAlbum(album.value);

            setNote("Matching credits against Genius…");

            // Resolved here, so no later step has to ask whether it ran.
            const artists = await resolveContributors(next);

            setBusy(false);
            setNote(null);
            onLoaded(next, artists);
        });
    };

    return (
        <Panel>
            <p>Provide the link for the Apple Music album.</p>
            <TextInput
                fullWidth
                hasError={note !== null}
                onChange={(event) => {
                    const input = event.currentTarget;

                    if (input instanceof HTMLInputElement) {
                        setNote(null);
                        setUrl(input.value);
                    }
                }}
                placeholder="https://music.apple.com/us/album/…"
                value={url}
            />
            <Actions>
                <Button
                    disabled={busy || url.trim() === ""}
                    onClick={fetchAlbum}
                    type="button"
                >
                    Fetch
                </Button>
                {busy ? <Spinner /> : null}
                {note === null ? null : <Note>{note}</Note>}
            </Actions>
        </Panel>
    );
};

export const AlbumStep = memo(renderAlbumStep);

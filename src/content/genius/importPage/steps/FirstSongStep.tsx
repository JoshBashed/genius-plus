/** Step four: the song that names the album, or the album itself. */

import { type FC, memo, useEffect, useState } from "react";
import type { SelectOption } from "@/bindings";
import type { ContributorPlan } from "../../albumImport/contributors";
import type { ImportedAlbum } from "../../albumImport/importedAlbum";
import { Button } from "../../geniusComponents/Button";
import { Spinner } from "../../geniusComponents/Spinner";
import { useGoogleReCaptcha } from "../../geniusHooks";
import { loadPrimaryTagOptions, optionLabel, searchSongs } from "../../options";
import { AlbumMedia } from "../AlbumMedia";
import { addSongUrl } from "../addSong";
import {
    attachToNewAlbum,
    describeAttachFailure,
    songAlbums,
} from "../attachAlbum";
import { CreateError } from "../CreateError";
import {
    type CreateSongFailure,
    createSong,
    createSongFields,
} from "../createSong";
import { type GeniusAlbum, searchGeniusAlbums } from "../geniusAlbums";
import { type SongChoice, SongSelect } from "../SongSelect";
import { Actions, Note, Panel, Rows } from "../styles";

/** How often the album is looked for while their form is open. */
const WATCH_DELAY_MS = 4000;

export interface FirstSongStepProps {
    readonly album: ImportedAlbum;
    /** The album's name as the reader left it, which may not be Apple's. */
    readonly albumName: string;
    /** The mapped artists, which a created song is credited to. */
    readonly artists: ContributorPlan;
    readonly primaryTagId: number;
    /** The album settled on, or `null` while one is still being found. */
    readonly target: GeniusAlbum | null;
    readonly onTarget: (
        target: GeniusAlbum | null,
        firstSongId?: number,
    ) => void;
    readonly onNext: () => void;
    readonly onBack: () => void;
}

const sameName = (left: string, right: string): boolean =>
    left.trim().toLowerCase() === right.trim().toLowerCase();

const renderFirstSongStep: FC<FirstSongStepProps> = ({
    album,
    albumName,
    artists,
    primaryTagId,
    onBack,
    onNext,
    onTarget,
    target,
}) => {
    const first = album.tracks[0];
    /** Nothing until a pick: the box opens on Apple's title, and the
     * `Create "…"` beside it is what settles on one. */
    const [song, setSong] = useState<SongChoice | null>(null);
    const [suggestions, setSuggestions] = useState<readonly SelectOption[]>([]);
    /** The albums the picked song is already on, to choose between. */
    const [choices, setChoices] = useState<readonly GeniusAlbum[]>([]);
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    /** Kept whole, not flattened to a line: a refusal names fields. */
    const [failure, setFailure] = useState<CreateSongFailure | null>(null);
    /** Set once their form is open in a tab of its own. */
    const [watching, setWatching] = useState(false);
    /** Recaptcha hook */
    const recaptcha = useGoogleReCaptcha();

    useEffect(() => recaptcha.initRecaptcha(), [recaptcha]);

    // The menu opens on what Genius has for this track, before a search.
    useEffect(() => {
        if (first === undefined) {
            return;
        }

        let live = true;

        void searchSongs(first.title).then((found) => {
            if (live) {
                setSuggestions(found);
            }
        });

        return () => {
            live = false;
        };
    }, [first]);

    // Their form is a page of its own, so it opens beside this one and
    // the album it creates is watched for rather than navigated back to.
    useEffect(() => {
        if (!watching || target !== null) {
            return;
        }

        let live = true;

        const look = (): void => {
            void searchGeniusAlbums(albumName).then((albums) => {
                if (!live || albums.isErr()) {
                    return;
                }

                // A name alone adopts a stranger's "Greatest Hits", so
                // the artist has to agree too. An album with no artist
                // stays unknown.
                const match = albums.value.find(
                    (entry) =>
                        sameName(entry.name, albumName) &&
                        entry.artistName !== null &&
                        sameName(entry.artistName, album.artistName),
                );

                if (match !== undefined) {
                    setWatching(false);
                    onTarget(match);
                }
            });
        };

        const timer = setInterval(look, WATCH_DELAY_MS);

        look();

        return () => {
            live = false;
            clearInterval(timer);
        };
    }, [album.artistName, albumName, onTarget, target, watching]);

    /** Naming a new album on a song is how one is born; there is no
     * album creation endpoint. */
    const createAlbumFor = (songId: number): void => {
        setBusy(true);
        setChoices([]);
        setNote(`Putting that song on "${albumName}"…`);

        void attachToNewAlbum(songId, albumName).then((created) => {
            setBusy(false);

            if (created.isErr()) {
                setNote(describeAttachFailure(created.error));
                return;
            }

            setNote(null);
            onTarget(created.value, songId);
        });
    };

    /** An existing song already knows which album this is. */
    const adoptExisting = (songId: number): void => {
        setBusy(true);
        setNote("Reading that song's albums…");

        void songAlbums(songId).then((albums) => {
            if (albums.isErr()) {
                setBusy(false);
                setNote(describeAttachFailure(albums.error));
                return;
            }

            const named = albums.value.find((entry) =>
                sameName(entry.name, albumName),
            );

            // Its own album beats creating a second one by the same name.
            if (named !== undefined) {
                setBusy(false);
                setNote(null);
                onTarget(named, songId);
                return;
            }

            if (albums.value.length > 0) {
                setBusy(false);
                setNote(null);
                setChoices(albums.value);
                return;
            }

            createAlbumFor(songId);
        });
    };

    /** Builds the request their own form would post, and prints it. */
    const createNewSong = async () => {
        if (song === null) {
            return;
        }

        setBusy(true);
        setNote(null);
        setFailure(null);

        // Their form sends the tag's name beside its id, and mirrors
        // the pair into `tags`, so the name is looked up here.
        const tags = await loadPrimaryTagOptions();
        const chosen = tags.find((option) => option.value === primaryTagId);

        const result = await createSong({
            recaptcha_token: await recaptcha.executeRecaptcha("create_song"),
            song: createSongFields(
                album,
                artists,
                song.title,
                chosen === undefined
                    ? null
                    : { id: primaryTagId, name: optionLabel(chosen.label) },
                albumName,
            ),
        });

        if (result.isErr()) {
            setBusy(false);
            setFailure(result.error);
            return;
        }

        // The song carries the album into being, and the answer names
        // it, so the usual case needs no second request at all.
        const answered =
            result.value.albums.find((entry) =>
                sameName(entry.name, albumName),
            ) ?? result.value.albums[0];

        if (answered !== undefined) {
            setBusy(false);
            setNote(null);
            onTarget(answered, result.value.songId);
            return;
        }

        setNote("Reading the album Genius just made…");

        const albums = await songAlbums(result.value.songId);

        setBusy(false);

        if (albums.isErr()) {
            setNote(
                `Created "${result.value.title}", but could not read its albums: ${describeAttachFailure(albums.error)}`,
            );
            return;
        }

        const made =
            albums.value.find((entry) => sameName(entry.name, albumName)) ??
            // Genius keeps the name it settled on, which is not always
            // the one we sent. A song it has just created is on the one
            // album it was created with, so that is the album.
            (albums.value.length === 1 ? albums.value[0] : undefined);

        if (made === undefined) {
            setNote(
                `Created "${result.value.title}", but Genius put it on no album called "${albumName}".`,
            );
            return;
        }

        setNote(null);
        onTarget(made, result.value.songId);
    };

    if (target !== null) {
        return (
            <Panel>
                <p>This album is the one being imported into.</p>
                <AlbumMedia
                    album={album}
                    title={<span className="gp-title">{target.name}</span>}
                />
                <Actions>
                    <Button onClick={onNext} type="button">
                        Next
                    </Button>
                    <Button
                        onClick={() => onTarget(null)}
                        secondary
                        type="button"
                    >
                        Pick another
                    </Button>
                    <Button onClick={onBack} secondary type="button">
                        Back
                    </Button>
                </Actions>
            </Panel>
        );
    }

    const existing = song?.kind === "song";

    return (
        <Panel>
            <p>
                Albums on Genius are created with their first song. Find it if
                Genius already has it, or name it to create it.
            </p>
            <AlbumMedia
                album={album}
                title={
                    <SongSelect
                        label="The album's first song"
                        onSelect={(choice) => {
                            setNote(null);
                            setFailure(null);
                            setChoices([]);
                            setSong(choice);
                        }}
                        initialText={first?.title}
                        placeholder={first?.title ?? "Search songs"}
                        suggestions={suggestions}
                        value={song}
                    />
                }
            />
            <Actions>
                {existing ? (
                    <Button
                        disabled={busy}
                        onClick={() => {
                            if (song?.kind === "song") {
                                adoptExisting(song.songId);
                            }
                        }}
                        type="button"
                    >
                        Next
                    </Button>
                ) : (
                    <>
                        <Button
                            disabled={busy || song === null}
                            onClick={() => {
                                // A rejection here would otherwise leave
                                // the spinner up and say nothing at all.
                                void createNewSong().catch((error: unknown) => {
                                    setBusy(false);
                                    setNote(
                                        `Creating the song stopped: ${String(error)}`,
                                    );
                                });
                            }}
                            type="button"
                        >
                            Create
                        </Button>
                        <Button
                            disabled={busy || song === null}
                            onClick={() => {
                                window.open(
                                    addSongUrl(first?.key ?? null),
                                    "_blank",
                                    "noopener",
                                );
                                setWatching(true);
                            }}
                            secondary
                            type="button"
                        >
                            Open their form
                        </Button>
                    </>
                )}
                <Button
                    disabled={busy}
                    onClick={onBack}
                    secondary
                    type="button"
                >
                    Back
                </Button>
                {busy ? <Spinner /> : null}
            </Actions>
            {choices.length === 0 ? null : (
                <>
                    <Note>
                        That song is on these already. One of them is probably
                        this album.
                    </Note>
                    <Rows>
                        <tbody>
                            {choices.map((entry) => (
                                <tr key={entry.id}>
                                    <td className="gp-name" title={entry.name}>
                                        {entry.name}
                                    </td>
                                    <td className="gp-name">
                                        <span className="gp-aside">
                                            {entry.artistName ?? ""}
                                        </span>
                                    </td>
                                    <td className="gp-action">
                                        <Button
                                            onClick={() => onTarget(entry)}
                                            secondary
                                            type="button"
                                        >
                                            Use this
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            <tr key="new">
                                <td className="gp-name" title={albumName}>
                                    {albumName}
                                </td>
                                <td className="gp-name">
                                    <span className="gp-aside">
                                        a new album
                                    </span>
                                </td>
                                <td className="gp-action">
                                    <Button
                                        disabled={busy}
                                        onClick={() => {
                                            if (song?.kind === "song") {
                                                createAlbumFor(song.songId);
                                            }
                                        }}
                                        secondary
                                        type="button"
                                    >
                                        Create this
                                    </Button>
                                </td>
                            </tr>
                        </tbody>
                    </Rows>
                </>
            )}
            {failure === null ? null : <CreateError failure={failure} />}
            {note === null ? null : <Note>{note}</Note>}
        </Panel>
    );
};

export const FirstSongStep = memo(renderFirstSongStep);

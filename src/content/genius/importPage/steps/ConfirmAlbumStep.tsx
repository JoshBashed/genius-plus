/** Step two: the album Apple returned, before anything is done with it. */

import type { SelectOption } from "@/bindings";
import { asPageValue, type PageComponent, type PageElement } from "@/bindings";
import {
    type ContributorPlan,
    unmappedCount,
    withExtraNames,
} from "../../albumImport/contributors";
import {
    type AlbumCredits,
    creditNames,
    loadAlbumCredits,
} from "../../albumImport/credits";
import type { ImportedAlbum } from "../../albumImport/importedAlbum";
import { genreTagId } from "../../albumImport/stage";
import { Button } from "../../geniusComponents/Button";
import { Checkbox } from "../../geniusComponents/Checkbox";
import { SelectInput } from "../../geniusComponents/SelectInput";
import { Spinner } from "../../geniusComponents/Spinner";
import { TextInput } from "../../geniusComponents/TextInput";
import { useLanguageOptions } from "../../geniusHooks";
import { loadPrimaryTagOptions } from "../../options";
import { memo, useEffect, useState } from "../../reactHost/react";
import { AlbumMedia } from "../AlbumMedia";
import { plural } from "../plural";
import { Actions, Choice, Note, Panel } from "../styles";
import type { ConfirmedAlbum } from "../wizard";

/** A finished read of their credits pages, and what it widened. */
interface CreditsRead {
    readonly credits: AlbumCredits;
    readonly artists: ContributorPlan;
}

export interface ConfirmAlbumStepProps {
    readonly album: ImportedAlbum;
    readonly artists: ContributorPlan;
    /** What this step settled last time, when the reader came back to it. */
    readonly settled: ConfirmedAlbum | null;
    /** Hands on whatever the credits pages gave, which may be nothing. */
    readonly onNext: (
        settled: ConfirmedAlbum,
        artists: ContributorPlan,
    ) => void;
    readonly onBack: () => void;
}

const renderConfirmAlbumStep = ({
    album,
    artists,
    onBack,
    onNext,
    settled,
}: ConfirmAlbumStepProps): PageElement => {
    const unmapped = unmappedCount(artists);
    /** Their credits are a page per track, so this is asked for. */
    const [wanted, setWanted] = useState(
        settled === null || settled.credits !== null,
    );
    /** Their seven primary tags, and the one this album is filed under. */
    const [tags, setTags] = useState<readonly SelectOption[]>([]);
    const [tagId, setTagId] = useState<number | null>(
        settled?.primaryTagId ?? null,
    );
    /** Genius rejects a title with no Latin characters, so this is
     * editable before anything is created under it. */
    const [albumName, setAlbumName] = useState(
        () => settled?.albumName ?? album.title,
    );
    /** Apple says nothing about language, so this starts unset. */
    const [language, setLanguage] = useState<string | null>(
        settled?.language ?? null,
    );
    const languages = useLanguageOptions();
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    /** Their credits pages are the slowest part of an import, so a read
     * that already happened is kept rather than repeated. */
    const [read, setRead] = useState<CreditsRead | null>(() =>
        settled === null || settled.credits === null
            ? null
            : { artists, credits: settled.credits },
    );

    // Apple's genre only suggests one; the reader decides.
    useEffect(() => {
        let live = true;

        void loadPrimaryTagOptions().then((options) => {
            if (!live) {
                return;
            }

            setTags(options);
            // A tag the reader already chose is not guessed at again.
            setTagId((current) => current ?? genreTagId(album.genre, options));
        });

        return () => {
            live = false;
        };
    }, [album.genre]);

    /**
     * Whether a partial read is holding the advance, so its note paints
     * and is read before this step is left.
     */
    const held = wanted && !busy && read !== null && note !== null;

    const next = (): void => {
        const name = albumName.trim();

        if (tagId === null || name === "") {
            return;
        }

        const settle = (
            credits: AlbumCredits | null,
            plan: ContributorPlan,
        ): void => {
            onNext(
                { albumName: name, credits, language, primaryTagId: tagId },
                plan,
            );
        };

        if (!wanted) {
            settle(null, artists);
            return;
        }

        // Read once, on the first pass through this step, and on a
        // second click carried on with rather than read again.
        if (read !== null) {
            settle(read.credits, read.artists);
            return;
        }

        setBusy(true);
        setNote("Reading credits…");

        void loadAlbumCredits(album, album.storefront, (done, total) => {
            setNote(`Reading credits, ${done} of ${total}…`);
        }).then(async (report) => {
            const { credits, failures } = report;
            const names = creditNames(credits);

            setNote(`Matching ${names.length} more names against Genius…`);

            const widened = await withExtraNames(artists, names);

            setBusy(false);
            setRead({ artists: widened, credits });

            // A silent nothing is how this looked when it was failing,
            // and a note set in the same batch as the advance never
            // paints, so the advance waits for a second click instead.
            if (failures.length === 0) {
                setNote(null);
                settle(credits, widened);
                return;
            }

            setNote(
                `Read credits for ${credits.size} of ` +
                    `${plural(album.tracks.length, "track")}; ` +
                    `${failures.length} gave nothing. Continue to import ` +
                    "without them.",
            );
        });
    };

    return (
        <Panel>
            <AlbumMedia
                album={album}
                title={
                    <TextInput
                        fullWidth
                        onChange={(event) => {
                            const input = event.currentTarget;

                            if (input instanceof HTMLInputElement) {
                                setAlbumName(input.value);
                            }
                        }}
                        placeholder={album.title}
                        value={albumName}
                    />
                }
            />
            <Note>
                {`${plural(album.tracks.length, "track")} on Apple`}
                {unmapped === 0
                    ? ""
                    : `, ${unmapped} credited to names Genius has no single exact match for`}
            </Note>
            <div className="gp-row">
                <span className="gp-label">Primary tag</span>
                <SelectInput
                    controlledValue={
                        tags.find((option) => option.value === tagId) ?? null
                    }
                    isClearable={false}
                    onChange={(option) => {
                        setTagId(
                            typeof option?.value === "number"
                                ? option.value
                                : null,
                        );
                    }}
                    options={tags}
                    placeholder={
                        album.genre === null
                            ? "Pick one"
                            : `Apple calls this ${album.genre}`
                    }
                />
            </div>
            <div className="gp-row">
                <span className="gp-label">Language</span>
                <SelectInput
                    controlledValue={
                        languages.find((option) => option.value === language) ??
                        null
                    }
                    isClearable
                    onChange={(option) => {
                        setLanguage(
                            option === null ? null : String(option.value),
                        );
                    }}
                    options={languages}
                    placeholder="Leave unset"
                />
            </div>
            <Choice>
                <Checkbox
                    checked={wanted}
                    disabled={busy}
                    onChange={() => setWanted(!wanted)}
                />
                {`Also read writers and producers (one Apple page per track, ${album.tracks.length} in all)`}
            </Choice>
            <Actions>
                <Button
                    disabled={busy || tagId === null || albumName.trim() === ""}
                    onClick={next}
                    type="button"
                >
                    {held ? "Continue" : "Next"}
                </Button>
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
            {note === null ? null : <Note>{note}</Note>}
        </Panel>
    );
};

export const ConfirmAlbumStep = memo(
    asPageValue<PageComponent<ConfirmAlbumStepProps>>(renderConfirmAlbumStep),
);

/** The album import, as a walk through five steps. */

import { useCallback, useState } from "react";
import {
    asPageValue,
    type PageComponent,
    type PageElement,
    type SelectOption,
} from "@/bindings";
import { type ContributorPlan, withMapping } from "../albumImport/contributors";
import type { AlbumCredits } from "../albumImport/credits";
import type { ImportedAlbum } from "../albumImport/importedAlbum";
// Deep imports, not the barrel: it evaluates every component, and this
// page binds only the few it renders with.
import type { GeniusAlbum } from "./geniusAlbums";
import { StepBar } from "./StepBar";
import { AlbumStep } from "./steps/AlbumStep";
import { ConfirmAlbumStep } from "./steps/ConfirmAlbumStep";
import { ConfirmImportStep } from "./steps/ConfirmImportStep";
import { FirstSongStep } from "./steps/FirstSongStep";
import { MapArtistsStep } from "./steps/MapArtistsStep";
import { Page } from "./styles";
import type { ConfirmedAlbum, Wizard } from "./wizard";

export interface ImportAssistantProps {
    /** An album the editor's own link already named, if it named one. */
    readonly album: GeniusAlbum | null;
}

const renderAssistant = ({ album }: ImportAssistantProps): PageElement => {
    const [wizard, setWizard] = useState<Wizard>({ step: 1 });
    /**
     * What step two settled, kept beside the walk rather than in it, so
     * stepping back into that step starts on the reader's own answers.
     */
    const [confirmed, setConfirmed] = useState<ConfirmedAlbum | null>(null);

    // Every step is memoised, so each of these is handed down as one
    // callback for the life of the page and none of them re-renders a
    // step that has nothing new to show.
    const onLoaded = useCallback(
        (loaded: ImportedAlbum, artists: ContributorPlan): void => {
            // Another album settles none of what the last one did.
            setConfirmed(null);
            setWizard({ album: loaded, artists, step: 2 });
        },
        [],
    );

    const onConfirmed = useCallback(
        (settled: ConfirmedAlbum, artists: ContributorPlan): void => {
            setConfirmed(settled);
            setWizard((current) => {
                if (current.step !== 2) {
                    return current;
                }

                const credits: AlbumCredits = settled.credits ?? new Map();

                return {
                    album: current.album,
                    albumName: settled.albumName,
                    artists,
                    credits,
                    firstSongId: null,
                    language: settled.language,
                    primaryTagId: settled.primaryTagId,
                    step: 3,
                    // The editor's own link, when it named one, is the
                    // album to import into before step four asks.
                    target: album,
                };
            });
        },
        [album],
    );

    const onRemap = useCallback(
        (name: string, options: readonly SelectOption[]): void => {
            setWizard((current) =>
                current.step === 3
                    ? {
                          ...current,
                          artists: withMapping(current.artists, name, options),
                      }
                    : current,
            );
        },
        [],
    );

    const onTarget = useCallback(
        (target: GeniusAlbum | null, firstSongId?: number): void => {
            setWizard((current) => {
                if (current.step !== 4) {
                    return current;
                }

                const settled = {
                    ...current,
                    firstSongId: firstSongId ?? current.firstSongId,
                };

                // Settling on an album is the whole of step four, so
                // finding one moves on instead of asking to confirm what
                // was just created. Losing one stays put.
                return target === null
                    ? { ...settled, target }
                    : { ...settled, step: 5, target };
            });
        },
        [],
    );

    const onMapped = useCallback((): void => {
        setWizard((current) =>
            current.step === 3 ? { ...current, step: 4 } : current,
        );
    }, []);

    const onFirstSong = useCallback((): void => {
        setWizard((current) =>
            // Only the case with a target can be step five.
            current.step === 4 && current.target !== null
                ? { ...current, step: 5, target: current.target }
                : current,
        );
    }, []);

    const backToAlbum = useCallback((): void => {
        setWizard({ step: 1 });
    }, []);

    // Each of these keeps the case it came from whole, so a step forward
    // again finds every answer, and the album step four created, where
    // the reader left them.
    const backToConfirm = useCallback((): void => {
        setWizard((current) =>
            current.step === 3
                ? {
                      album: current.album,
                      artists: current.artists,
                      step: 2,
                  }
                : current,
        );
    }, []);

    const backToArtists = useCallback((): void => {
        setWizard((current) =>
            current.step === 4 ? { ...current, step: 3 } : current,
        );
    }, []);

    const backToFirstSong = useCallback((): void => {
        setWizard((current) =>
            current.step === 5 ? { ...current, step: 4 } : current,
        );
    }, []);

    const body = (): PageElement => {
        switch (wizard.step) {
            case 1:
                return <AlbumStep onLoaded={onLoaded} />;
            case 2:
                return (
                    <ConfirmAlbumStep
                        album={wizard.album}
                        artists={wizard.artists}
                        onBack={backToAlbum}
                        onNext={onConfirmed}
                        settled={confirmed}
                    />
                );
            case 3:
                return (
                    <MapArtistsStep
                        artists={wizard.artists}
                        onBack={backToConfirm}
                        onChange={onRemap}
                        onNext={onMapped}
                    />
                );
            case 4:
                return (
                    <FirstSongStep
                        album={wizard.album}
                        albumName={wizard.albumName}
                        artists={wizard.artists}
                        primaryTagId={wizard.primaryTagId}
                        onBack={backToArtists}
                        onNext={onFirstSong}
                        onTarget={onTarget}
                        target={wizard.target}
                    />
                );
            case 5:
                return (
                    <ConfirmImportStep
                        album={wizard.album}
                        credits={wizard.credits}
                        language={wizard.language}
                        firstSongId={wizard.firstSongId}
                        artists={wizard.artists}
                        onBack={backToFirstSong}
                        primaryTagId={wizard.primaryTagId}
                        target={wizard.target}
                    />
                );
        }
    };

    return (
        <Page>
            <h1>Album Import</h1>
            <StepBar step={wizard.step} />
            {body()}
        </Page>
    );
};

export const ImportAssistant =
    asPageValue<PageComponent<ImportAssistantProps>>(renderAssistant);

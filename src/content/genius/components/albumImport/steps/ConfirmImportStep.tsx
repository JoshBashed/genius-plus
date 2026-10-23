/** Step five: what the import will do, and the two ways to run it. */

import { type FC, memo, useEffect, useState } from "react";
import type { SelectOption } from "@/bindings";
import {
    describeAlbumTracksFailure,
    loadAlbumTracks,
} from "@/content/genius/albumImport/albumTracks";
import {
    type ContributorPlan,
    unmappedCount,
} from "@/content/genius/albumImport/contributors";
import type { AlbumCredits } from "@/content/genius/albumImport/credits";
import {
    appleAlbumType,
    type ImportedAlbum,
} from "@/content/genius/albumImport/importedAlbum";
import {
    matchTracks,
    type TrackMatch,
    titleAccepted,
} from "@/content/genius/albumImport/matchTracks";
import {
    type SongChoice,
    SongSelect,
} from "@/content/genius/components/albumImport/SongSelect";
import {
    Actions,
    Note,
    Panel,
    Problem,
    Rows,
    Scroller,
} from "@/content/genius/components/albumImport/styles";
import { Button } from "@/content/genius/components/genius/Button";
import { Icon } from "@/content/genius/components/genius/Icon";
import { Spinner } from "@/content/genius/components/genius/Spinner";
import type { GeniusAlbum } from "@/content/genius/importPage/geniusAlbums";
import {
    describeEmptyImport,
    describeImportFailure,
    runImport,
} from "@/content/genius/importPage/runImport";
import type { CreditMode } from "@/content/genius/importPage/wizard";
import { optionLabel, searchSongs } from "@/content/genius/utilities/options";
import { drain } from "@/content/genius/utilities/pool";
import { plural } from "@/utilities/plural";

/** Gentle: this is one search per unmatched track. */
const SEARCH_CONCURRENCY = 4;

/** Every artist this album credits, lowercased, for comparing hits. */
const creditedNames = (artists: ContributorPlan): ReadonlySet<string> => {
    const names = new Set<string>();

    for (const entry of Object.values(artists.contributors)) {
        for (const option of entry.options) {
            names.add(optionLabel(option.label).trim().toLowerCase());
        }
    }

    return names;
};

/**
 * Whether any hit is by somebody this album credits.
 * A song of the same name by an unrelated artist is not this track, so
 * proposing a new one is only safe when nobody here already has it.
 */
const byOurArtists = (
    hits: readonly SelectOption[],
    credited: ReadonlySet<string>,
): boolean =>
    hits.some((hit) => {
        const label = hit.label;
        const artists =
            typeof label === "object" ? (label.secondary ?? "") : "";

        return [...credited].some(
            (name) => name !== "" && artists.toLowerCase().includes(name),
        );
    });

export interface ConfirmImportStepProps {
    readonly album: ImportedAlbum;
    /** What their credits pages gave, which is where writers and
     * producers come from and the only place they do. */
    readonly credits: AlbumCredits;
    /** Genius's own language code, when the reader picked one. */
    readonly language: string | null;
    /** The song that named the album, which is its first track. */
    readonly firstSongId: number | null;
    readonly primaryTagId: number;
    readonly artists: ContributorPlan;
    readonly target: GeniusAlbum;
    readonly onBack: () => void;
}

const renderConfirmImportStep: FC<ConfirmImportStepProps> = ({
    album,
    credits,
    language,
    firstSongId,
    primaryTagId,
    artists,
    onBack,
    target,
}) => {
    /** Each Apple track against the song it is, keyed by Apple's id. */
    const [choices, setChoices] = useState<ReadonlyMap<number, SongChoice>>(
        () => new Map(),
    );
    /** What Genius offered per row, so a menu opens on something. */
    const [offers, setOffers] = useState<
        ReadonlyMap<number, readonly SelectOption[]>
    >(() => new Map());
    /** The boxes open on a name, which only a mount reads, so they are
     * not rendered until there is one to open on. */
    const [ready, setReady] = useState(false);
    /**
     * Rows this page named rather than the reader. They render as text
     * they can correct, not as a tag that reads as already settled.
     */
    const [proposed, setProposed] = useState<ReadonlySet<number>>(
        () => new Set(),
    );
    const [busy, setBusy] = useState(false);
    /** Written beside the songs, and not written: shown before leaving. */
    const [warnings, setWarnings] = useState<readonly string[]>([]);
    /** Where to go once the reader has read those, if there were any. */
    const [done, setDone] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);

    // A search per unmatched track, which the reader can walk away from
    // long before it finishes, so leaving the step abandons it.
    useEffect(() => {
        let live = true;

        void loadAlbumTracks(target.id).then(async (tracks) => {
            if (!live) {
                return;
            }

            // Every row is left for the reader, which is no worse than a
            // search that found nothing, and nothing is proposed as new.
            if (tracks.isErr()) {
                const first = album.tracks[0];

                // The song that named the album is known by its id, and
                // leaving it unchosen invites creating it a second time.
                if (firstSongId !== null && first !== undefined) {
                    setChoices(
                        new Map([
                            [
                                first.key,
                                {
                                    kind: "song",
                                    songId: firstSongId,
                                    title: first.title,
                                },
                            ],
                        ]),
                    );
                }

                setNote(
                    `Tracklist not read: choose a song for each track (${describeAlbumTracksFailure(tracks.error)}).`,
                );
                setReady(true);
                return;
            }

            const credited = creditedNames(artists);

            const matched = matchTracks(album.tracks, tracks.value).matches;
            // Its name on Genius, which is the one it was created under
            // and not Apple's when the reader renamed it.
            const named = new Map(
                tracks.value.map((seed) => [seed.songId, seed.title]),
            );
            const settled = new Map<number, SongChoice>();
            const found = new Map<number, readonly SelectOption[]>();
            const firstKey = album.tracks[0]?.key;
            /** Rows whose search failed, which are left for the reader. */
            let unsearched = 0;

            for (const match of matched) {
                // The song that named the album is known outright: once
                // renamed it matches neither Apple's title nor a number.
                const songId =
                    firstSongId !== null && match.imported.key === firstKey
                        ? firstSongId
                        : match.songId;

                if (songId !== null) {
                    settled.set(match.imported.key, {
                        kind: "song",
                        songId,
                        title: named.get(songId) ?? match.title,
                    });
                }
            }

            // Nothing is proposed as new until Genius has been asked and
            // none of this album's own artists already has it.
            await drain(
                matched.filter((match) => !settled.has(match.imported.key)),
                SEARCH_CONCURRENCY,
                async (match) => {
                    // Cancelled part way through, so the rest of the
                    // queue is never searched for at all.
                    if (!live) {
                        return;
                    }

                    const hits = await searchSongs(match.imported.title);

                    // No answer is not "no such song", so it is never
                    // proposed as new on the strength of one.
                    if (hits.isErr()) {
                        unsearched += 1;
                        return;
                    }

                    found.set(match.imported.key, hits.value);

                    if (!byOurArtists(hits.value, credited)) {
                        settled.set(match.imported.key, {
                            kind: "new",
                            title: match.title,
                        });
                    }
                },
            );

            if (!live) {
                return;
            }

            setOffers(found);
            setChoices(settled);

            if (unsearched > 0) {
                setNote(
                    `Search failed for ${plural(unsearched, "track")}: choose a song for each.`,
                );
            }

            setProposed(
                new Set(
                    [...settled]
                        .filter(([, choice]) => choice.kind === "new")
                        .map(([key]) => key),
                ),
            );
            setReady(true);
        });

        return () => {
            live = false;
        };
    }, [album.tracks, artists, firstSongId, target.id]);

    /** What the reader has settled on, in Apple's order. */
    const settled = (): readonly TrackMatch[] =>
        album.tracks.map((track) => {
            const choice = choices.get(track.key);

            return {
                imported: track,
                songId: choice?.kind === "song" ? choice.songId : null,
                title: choice?.title ?? track.title,
            };
        });

    const start = (mode: CreditMode): void => {
        setBusy(true);
        setNote("Creating the songs Genius is missing…");

        void runImport({
            album,
            albumId: target.id,
            albumType: appleAlbumType(album),
            language,
            albumUrl: target.url,
            contributors: artists,
            credits,
            matches: settled(),
            mode,
            primaryTagId,
            onProgress: setNote,
        }).then((outcome) => {
            setBusy(false);

            if (outcome.isErr()) {
                setNote(describeImportFailure(outcome.error));
                return;
            }

            // Nothing staged is not a success worth navigating away
            // from: the album's editor would open on no edits at all,
            // and the reason for that is only known here.
            if (outcome.value.staged === 0) {
                setNote(describeEmptyImport(outcome.value));
                return;
            }

            // The cover and the album's own record are written beside
            // the songs, and used to fail into the console alone. A
            // reader sent to the album would have called that a success.
            if (outcome.value.warnings.length > 0) {
                setWarnings(outcome.value.warnings);
                setNote(null);
                setDone(outcome.value.url);
                return;
            }

            location.assign(outcome.value.url);
        });
    };

    const unmapped = unmappedCount(artists);
    /** Rows nobody has settled on yet, which a run would create again. */
    const undecided = album.tracks.filter(
        (track) => !choices.has(track.key),
    ).length;
    /** Matching has finished and every row has a choice behind it. */
    const runnable = ready && undecided === 0;
    /** Rows Genius would refuse, because the name they carry has no
     * Latin letters in it. */
    const unnamed = album.tracks.filter((track) => {
        const choice = choices.get(track.key);

        return choice?.kind === "new" && !titleAccepted(choice.title);
    });

    return (
        <Panel>
            <p>
                {`Apple lists ${plural(
                    album.tracks.length,
                    "track",
                )}. Anything this album does not have yet is created.`}
            </p>
            {ready ? null : <Spinner />}
            <Scroller>
                <Rows>
                    <tbody>
                        {!ready
                            ? []
                            : album.tracks.map((track) => {
                                  const choice = choices.get(track.key) ?? null;

                                  return (
                                      <tr key={track.key}>
                                          <td className="gp-number">
                                              {track.trackNumber ?? ""}
                                          </td>
                                          <td className="gp-pick">
                                              <SongSelect
                                                  label={`Song for ${track.title}`}
                                                  suggestions={offers.get(
                                                      track.key,
                                                  )}
                                                  onSelect={(next) => {
                                                      // Theirs now, so it reads
                                                      // as a tag from here on.
                                                      setProposed(
                                                          (previous) => {
                                                              const kept =
                                                                  new Set(
                                                                      previous,
                                                                  );

                                                              kept.delete(
                                                                  track.key,
                                                              );
                                                              return kept;
                                                          },
                                                      );
                                                      setChoices((previous) => {
                                                          const merged =
                                                              new Map(previous);

                                                          if (next === null) {
                                                              merged.delete(
                                                                  track.key,
                                                              );
                                                          } else {
                                                              merged.set(
                                                                  track.key,
                                                                  next,
                                                              );
                                                          }

                                                          return merged;
                                                      });
                                                  }}
                                                  asText={proposed.has(
                                                      track.key,
                                                  )}
                                                  initialText={
                                                      choice === null ||
                                                      proposed.has(track.key)
                                                          ? (choice?.title ??
                                                            track.title)
                                                          : ""
                                                  }
                                                  placeholder={track.title}
                                                  value={choice}
                                              />
                                          </td>
                                          <td className="gp-state">
                                              {choice === null ? (
                                                  <Icon
                                                      className="gp-icon gp-icon-missing"
                                                      height={14}
                                                      names={[
                                                          "warning",
                                                          "alert",
                                                      ]}
                                                      width={14}
                                                  />
                                              ) : choice.kind === "new" ? (
                                                  <Icon
                                                      className="gp-icon gp-icon-new"
                                                      height={14}
                                                      names={["plus"]}
                                                      width={14}
                                                  />
                                              ) : (
                                                  <Icon
                                                      className="gp-icon gp-icon-kept"
                                                      height={14}
                                                      names={["check"]}
                                                      width={14}
                                                  />
                                              )}
                                              <span className="gp-said">
                                                  {choice === null
                                                      ? "Nothing chosen yet"
                                                      : choice.kind === "new"
                                                        ? "Will be created"
                                                        : "Already on the album"}
                                              </span>
                                          </td>
                                      </tr>
                                  );
                              })}
                    </tbody>
                </Rows>
            </Scroller>
            {unnamed.length === 0 ? null : (
                <Note>
                    {`Genius refuses a title with no Latin letters, so ${plural(
                        unnamed.length,
                        "track",
                    )} cannot be created under the name shown. Rename them above, or pick the song Genius already has.`}
                </Note>
            )}
            {unmapped === 0 ? null : (
                <Note>
                    {`${unmapped} credited names are left blank and will be skipped. You can add them by hand in the editor.`}
                </Note>
            )}
            {!ready || undecided === 0 ? null : (
                <Note>
                    {`Pick a song, or a new one, for ${plural(
                        undecided,
                        "track",
                    )} before the import can run.`}
                </Note>
            )}
            {warnings.length === 0 ? null : (
                <Problem>
                    <span>
                        The songs were saved. The album's own record was not
                        fully written.
                    </span>
                    {warnings.map((line) => (
                        <span key={line}>{line}</span>
                    ))}
                </Problem>
            )}
            {done === null ? null : (
                <Actions>
                    <Button
                        onClick={() => {
                            location.assign(done);
                        }}
                        type="button"
                    >
                        Go to the album
                    </Button>
                </Actions>
            )}
            <Actions>
                <Button
                    disabled={busy || !runnable}
                    onClick={() => start("empty")}
                    type="button"
                >
                    Fill empty fields only
                </Button>
                <Button
                    disabled={busy || !runnable}
                    onClick={() => start("all")}
                    secondary
                    type="button"
                >
                    Replace every field
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

export const ConfirmImportStep = memo(renderConfirmImportStep);

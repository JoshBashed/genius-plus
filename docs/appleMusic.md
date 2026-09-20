# Apple Music, as a source

How the import reads an album off Apple, and what their data does and
does not carry. Like the Genius notes, everything here is measured;
record new findings in this file.

## The lookup

- `itunes.apple.com/lookup` answers `ACAO: *`, and Genius's CSP is
  report-only, so the page fetches it directly. No relay, no host
  permission.
- Per-track release dates are real single release dates, not noise, so
  the import takes the track's own date over the album's.

## Credits

- **Credits are grouped by Apple's own `role-categories`, not by role
  words.** Their answer ships `composer-and-lyrics`,
  `production-and-engineering`, and `performer`, each naming its credits
  in the order their page shows them. Classifying by role name instead
  dropped everyone their categories include and a word list does not: an
  `Arranger` sits under composition there, and mixing and mastering sit
  under production. The word lists survive only as a fallback for an
  answer carrying no categories.
- **Engineers go in producers, deliberately.** Their
  `production-and-engineering` group holds mixing and mastering
  engineers, Genius keeps those as credits of their own, and
  `bulk_update_songs` has no array for them. Filing them under producers
  is the choice this repo made, not an oversight to tidy up.
- Apple carries no writers or producers in the lookup itself.
  Contributors there come from the track artist string and the title's
  `(feat. ...)` clause, and nothing else.
- **A credit is only split on `,`, `&`, and `+` after Genius has been
  asked about the whole string.** "Earth, Wind & Fire" and "Tyler, The
  Creator" are exact artists; splitting first would invent five people.

## The credits token

- **Apple's credits token is origin bound.** The `WebPlayKid` JWT in
  their entry bundle carries `root_https_origin: ["apple.com"]`, and
  amp-api answers **401** to a request whose `Origin` is anything else.
  `fetch` forbids setting `Origin`, so the header is rewritten by a
  `declarativeNetRequest` rule (`src/background/appleOrigin.ts`) rather
  than passed to `fetch`, where it is silently dropped. Measured: bearer
  alone is 401, bearer plus `Origin: https://music.apple.com` is 200.

## Resolving names against Genius

- `loadArtistOptions` (`src/content/genius/options.ts`) is debounced and
  settles every waiting caller on the last one's answer. Resolving many
  names at once needs `searchArtists`.

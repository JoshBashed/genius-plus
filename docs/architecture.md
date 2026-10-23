# Architecture

What lives where, and the design decisions a file on its own will not
explain. The invariants that must never break are summarised in
CLAUDE.md; this file is the detail behind them.

## Repo map

| Path | What it is |
| --- | --- |
| `src/manifest.ts` | Builds the MV3 manifest; emitted `dist/` names live here |
| `src/background/` | Service worker: image relay, Apple `Origin` rewrite rule |
| `src/popup/` | Extension popup, our own React 19 and Tailwind |
| `src/components/` | Popup UI kit (glass surfaces, switch, springs) |
| `src/utilities/` | Shared helpers: http, decode, messaging, settings, log |
| `src/bindings/` | Runtime discovery of Genius's own bundle; see its README |
| `src/content/shared/` | Artwork overlay feature shared by the music sites |
| `src/content/soundcloud/` | Link cleaning, isolated plus MAIN world |
| `src/content/appleMusic/` | Apple Music content script |
| `src/content/genius/` | The editor itself, detailed below |

Inside `src/content/genius/`:

| Path | What it is |
| --- | --- |
| `index.ts` | The MAIN-world entry, which only calls `initFeatures()` |
| `isolated/` | The isolated-world entry, and `early.ts`, which runs first |
| `react/` | The page's React, and the jsx runtime ours compiles to |
| `features/` | `initFeatures`, `mount.ts`, and one folder per feature |
| `features/metadataEditor/` | The album table: its loader, drafts, saves, and reads |
| `features/albumImport/` | The Apple import: its loader and its pipeline |
| `components/genius/` | Slot-backed borrowed components |
| `components/metadataEditor/`, `components/albumImport/` | Each feature's UI |
| `utilities/genius/` | Slot-backed borrowed hooks |
| `utilities/geniusApi/` | One function per Genius endpoint, each with its schema |
| `utilities/` | The rest of the plumbing: `install.ts`, `slot.ts`, `relay.ts`, the bundle linker, and page-state reads |

## Two Reacts, and the slot pattern

- The page runs React 18; we bundle 19 for the popup only. Borrowed
  Genius components work only in theirs.
- **`react` means their React under `src/content/genius/`.** A rule in
  `rspack.config.ts` resolves it to `react/index.ts` for that directory
  alone, and its `tsconfig.json` types it with `@types/react-18`, the
  version the page runs. `react-dom`, and any `react` in
  `src/bindings/`, is refused; `scripts/checkReact.mjs` also fails the
  build if React's own code reaches a Genius bundle.
- JSX there compiles to `react/jsx-runtime` as usual, which the same
  rule resolves to `react/index.ts`, where `jsx` is built on their
  `createElement`. Its exports are live `let` bindings that `bindReact`
  assigns at install, so they carry React's own overloaded types. The directory's own `tsconfig.json` is why
  `pnpm typecheck` runs two projects.
- **Borrowed things live in slots, read at the call.** Each module in
  `components/genius/` and `utilities/genius/` holds a `slot()` and exports a
  `setX` beside a wrapper that reads it when something renders or calls
  it. So they import like ordinary React (`import { TagInput }`,
  `import { usePusher }`), the barrel is safe, import order does not
  matter, and a re-prime reaches modules that were already imported.
- `utilities/install.ts` fills the slots with `installAll([installs(getX, xSlot)])`,
  and `installOptional` for the ones a page can do without.
- **`styled` is the exception.** `styled("div")` has to return a
  component at module evaluation, so a styles module still has to be
  imported after the binding is installed. That is the only reason
  `features/metadataEditor/index.ts` reaches the table through an eager
  `import()` of `components/metadataEditor`.
- `theme()` is a call, never a stored value: `deviceType` changes on a
  resize and a re-prime replaces it without re-evaluating a module.

## Binding to their bundle

- **Every bundle is resolved from About Genius.** `JSLinker` in
  `utilities/jsLinker.ts` reads the chunk list of `/songs/474187`, a
  song page, and imports each bundle from exactly that URL. Captured
  2026-09-23, signed out: its `<head>` lists 128 chunks, among them
  every one we bind (`TagInput`, `SelectInput`, `TextInput`,
  `Checkbox`, `SmallButton`, `Dropdown`, `useAvailableRoles`, the
  `plus`, `warning`, `check`, and `alert` icons, and the rest). An
  album, artist, home, or 404 page lists 40 to 53 and lacks the form's
  11; `/new` redirects to `/signup` when signed out.
- The list is cached in `chrome.storage.local` for a day, through the
  isolated half. It is used only while it has this page's own
  `react-vendor` and every chunk it shares with this page has the same
  URL in both: a different one means Genius shipped a new build, and
  importing from that list would put a second copy of a shared module,
  React or a context, beside the page's own. The linker then reads the
  page again, and when even that disagrees, the tab is older than
  Genius: it says to reload, and stops trying until the page is. A page
  with no React, such as an error or a bot check, is never cached, and
  is read again on the next lookup rather than taken for an old tab.
- Base names the donor loads under more than one URL are kept as
  duplicates, as the page's own are, so a lookup refuses to guess.
- **Only Genius's own chunks are ever imported.** Any script on a
  Genius page can post the cache's messages, so both halves accept a
  list only when every URL is a `.js` file on the origin the page's own
  React comes from, and the linker drops other hosts' module scripts
  from About Genius's list before using or caching it.
- **Components are found by display name, not by chunk name.** A
  chunk is named after its first module, so Genius can move a component
  into an unrelated one: `Spinner` now lives in the `alert` chunk. Once
  per build, `exportIndex.ts` imports About Genius's chunks inside a
  hidden `srcdoc` frame, records each chunk's exported display names,
  and deletes the frame. It skips the page's entry scripts, which boot
  their whole app. The frame's CSP is `default-src 'none'` with only the
  chunk host and a nonce allowed to run scripts, and its sandbox stops
  it navigating this page, so their modules load without reaching the
  network or this page. Its answer is decoded with zod, which copies it
  out of the frame so the removed frame can be collected. The index is
  built in the background, and nothing else waits for it. It is cached with the list,
  and a list whose index failed is cached with every chunk left to
  read. A binding that names a component (`bindNamed`) looks in the
  chunk of that name first; only a component Genius has moved waits for
  the index, which points at the chunk to import, in the page, from the
  same URL.
  Chunks the frame could not import are cached with the index, and
  retried once per page when a binding asks for a name it lacks, so a
  failed load does not leave a component missing for the day.
- Never hardcode a hash, a chunk URL, or a minified export letter.
- **Their build tool is unidentified, and nothing here should assume
  one.** Measured: native ESM, one chunk per module named
  `<base>-<hash>.js` with relative specifiers, `modulepreload` links in
  the head, and cross-chunk exports renamed to single letters. Rails
  serves it, since a Sprockets asset sits alongside on the same page.
  It is not webpack, which emits no ESM of this shape, and carries none
  of Vite's markers: no `__vitePreload`, no `import.meta`, no
  `__vite__mapDeps`. Bind to the shape above, never to a toolchain.
- Genius chunks are imported with `/* webpackIgnore: true */` so rspack
  leaves them alone. Different comment from the eager one, different
  job.
- **A page only preloads the chunks its own route renders.** Album pages
  and the 404 carry no `useLanguageOptions`; song pages do, and there is
  no build manifest to resolve one that is absent. So prefer a chunk
  every React page preloads and rebuild the few lines on top of it:
  `useLanguageOptions` is now ours, over the `useTranslation` that
  `useMixpanelEvent` re-exports, found by a `reportNamespaces`
  predicate. Their list lives at
  `i18n.store.data.<language>.translation.languages`.

## Component gotchas

- **`TagInput` owns its own text box.** It passes react-select an
  `onInputChange` of its own, so driving `inputValue` through
  `reactSelectProps` freezes the field: our handler never runs, every
  keystroke re-renders the same value, and the caret jumps to the end.
  Prefill with `defaultInputValue`, read once at mount, and let their
  `preservesOnBlur` / `creatablePreservesOnBlur` keep it there.

## Where error types live

The principle is in CLAUDE.md: an error type sits beside its producer,
never in a shared bag. The current map:

- `utilities/decode.ts`: `DecodeFailure`
- `utilities/http.ts`: `NetworkError`, `HttpError`, `RequestError`
- `utilities/messaging.ts`: `NoReceiverError`, `DeliveryError`
- `utilities/artwork.ts`: `ImageError`
- `bindings/errors.ts`: `BindingError`, `UnsupportedPageError`,
  `ChunkError`
- `content/genius/utilities/geniusApi/`: `AuthError`, `ReadFailure`,
  `WriteFailure`
- `content/genius/utilities/pageState.ts`: `PageError`
- and so on, per module. `CreateSongFailure` in
  `features/albumImport/createSong.ts` is the shape to copy: a private
  `asFailure` flattens the layer below, and a `describeX` sits beside
  it.

## Import assistant decisions

- **The import never renames a song.** `title` is not an `ImportField`.
  A song is named once, where it is created: the confirm step for one
  the tracklist makes, the first song step for the one that makes the
  album. Nothing written afterwards touches a name.
- **The import saves; it does not stage and wait.** `runImport` builds
  `SongEdit`s and goes through `planSave` / `runSave`, the album
  editor's own path, so permissions, the conflict re-read, and the
  Pusher confirmation are the ones already written. The stash is kept
  only as a net: merged with whatever the album's editor already had,
  and pruned after the save to the rows Genius stored outright, so a
  queued row and an editor's own unsaved work both survive. The redirect
  carries `EDITOR_HASH` whenever anything is still pending, queued
  included, because only the album's table hears the Pusher verdict.
- Creating the album's first song posts `POST /api/songs` directly, with
  a token from Genius's own `useGoogleReCaptcha`. Their Add A Song form
  stays offered beside it, for a session that cannot mint one. See the
  reCAPTCHA rule at the end of `docs/geniusApi.md`.

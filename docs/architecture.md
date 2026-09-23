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
| `index.ts` / `mainWorld.ts` | Isolated-world and MAIN-world entries |
| `relay.ts` | `postMessage` bridge between the two worlds |
| `install.ts` | Finds everything borrowed and fills its slot, at startup |
| `slot.ts` | `slot()`, a value that is bound after its module loads |
| `loaders/` | One loader per page kind, and `mount.ts`, which runs them |
| `react/` | The page's React, and the jsx runtime ours compiles to |
| `geniusComponents/`, `geniusHooks/` | Slot-backed borrowed bindings |
| `songTable/` | The album metadata editor table |
| `importPage/`, `albumImport/` | The Apple import assistant, its pipeline |
| `api.ts`, `write.ts` | Genius HTTP plumbing and the save path |
| `draft.ts`, `draftStash.ts` | Row drafts, and their localStorage stash |
| `bulkStatus.ts` | Parses Pusher `bulk-song-update-status` events |
| `pageState.ts`, `pageConfig.ts`, `pageContext.ts` | Page-state reads |

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
  rule resolves to `react/jsxRuntime.ts`. The directory's own
  `tsconfig.json` is why `pnpm typecheck` runs two projects.
- **Borrowed things live in slots, read at the call.** Each module in
  `geniusComponents/` and `geniusHooks/` holds a `slot()` and exports a
  `setX` beside a wrapper that reads it when something renders or calls
  it. So they import like ordinary React (`import { TagInput }`,
  `import { usePusher }`), the barrel is safe, import order does not
  matter, and a re-prime reaches modules that were already imported.
- `install.ts` fills the slots with `installAll([installs(getX, setX)])`,
  and `installOptional` for the ones a page can do without.
- **`styled` is the exception.** `styled("div")` has to return a
  component at module evaluation, so a styles module still has to be
  imported after the binding is installed. That is the only reason
  `loaders/albumTable.ts` reaches the table through
  `import(/* webpackMode: "eager" */ "../songTable")`.
- `theme()` is a call, never a stored value: `deviceType` changes on a
  resize and a re-prime replaces it without re-evaluating a module.

## Binding to their bundle

- Chunk URLs and export names are read from the live `<head>` every
  load. Never hardcode a hash, a URL, or a minified export letter. The
  full discovery and finder story is `src/bindings/README.md`.
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
- `content/genius/api.ts`: `AuthError`, `ReadFailure`, `WriteFailure`
- `content/genius/pageState.ts`: `PageError`
- and so on, per module. `CreateSongFailure` in
  `importPage/createSong.ts` is the shape to copy: a private `asFailure`
  flattens the layer below, and a `describeX` sits beside it.

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

# Genius+ conventions

Editor tooling for Genius. Not a lyrics viewer for listeners.

## Knowledge base

Read the doc for an area before working in it, and write new measured
facts back into it. Domain detail lives there, not here.

- `docs/architecture.md`: repo map, the two-React design, the slot
  pattern, where error types live, and the import assistant's design
  decisions.
- `docs/geniusApi.md`: every Genius endpoint this extension calls, with
  captured payload shapes, auth, and failure semantics. Includes the
  reCAPTCHA rule.
- `docs/appleMusic.md`: the Apple Music lookup, credit handling, and the
  origin-bound credits token.
- `src/bindings/README.md`: how Genius's own bundle is discovered and
  bound at runtime.

**Capture beats inference.** Endpoint shapes in `docs/geniusApi.md` come
from captured live requests. Inference was wrong three times; captures
were right first time. Ask for a real DevTools request before guessing a
body shape, and record what it said.

## Hard rules

- **Re-read before writing.** A draft baseline is a snapshot, and
  clobbering another editor is a real lost update. Tracklist and cover
  art writes replace whole sets, so anything not carried through is
  deleted.
- **A queued bulk write is not a save.** Say "queued" until the Pusher
  verdict lists the song. Details in `docs/geniusApi.md`.

## Toolchain

- **pnpm only.** Never npm or yarn, including registry lookups.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must all pass. Keep them
  green.
- **Run `pnpm typecheck`, never bare `tsc --noEmit`.**
  `src/content/genius/` has its own `tsconfig.json` for
  `jsxImportSource`, and the bare compiler skips that project silently.
- Emitted `dist/` filenames are referenced by `src/manifest.ts`. Renaming
  a source file must not move them.

## Style

- 80 columns, 4 space indent, double quotes, semicolons, trailing commas.
- **Arrow functions only.** The `function` keyword is a lint error.
- Strict TS: `verbatimModuleSyntax`, `noUncheckedIndexedAccess` (which is
  why `styled("div")` is required over `styled.div`), no `any`, no
  non-null assertions.
- **Spacing is flex and `gap`, never margins.** No `margin` for spacing,
  and no Tailwind `m-*`/`mt-*`/`ml-auto`. `margin: 0` to neutralise a
  user-agent default is the only exception.
- **Tailwind only** for our own UI. No hand-written CSS files. Configure
  in `tailwind.config.ts`, not with `@source`/`@theme` in the stylesheet.
- Every failure is a `Result` from `@resulted/results`. Never throw
  across a boundary. See **Errors** below for what goes in the error
  slot.

## Errors

- **No blanket error type.** A signature declares exactly what it can
  fail with, so a caller can see it and a `switch` has no impossible
  arms. `Result<Album, RequestError | DecodeFailure>`, never a catch-all.
- **An error type lives beside whatever produces it**, not in a shared
  bag. The current map is in `docs/architecture.md`; `CreateSongFailure`
  in `importPage/createSong.ts` is the shape to copy.
- A module may name one union for **its own** domain, as `api.ts` does.
  That is per module and stays there; it is not a new global.
- **There is no `AppError`, `AppResult`, or `describeError`.** They were
  deleted. Never reintroduce a catch-all error, result, or describer.
- **An error never bubbles with information its caller does not need.**
  No variant wraps another layer's error object. A signature's union is
  flat and self-contained, each variant carrying exactly the fields its
  own message needs, flattened at the boundary by a private `asFailure`.
- Each family carries its own one line `describeX`, rather than one
  function switching over everything.
- A refusal keeps the server's own words: `HttpError` carries `messages`
  and `validationErrors`, both read before the status is judged, because
  Genius puts the only useful line in the body.

## Parsing

- **Zod, through `decode()` or `decodeOr()` in `utilities/decode.ts`.**
  Never `schema.parse`, which throws; `decode` returns a `Result` and
  `decodeOr` returns `null` for a value a caller can do without.
- No hand rolled `record()` / `stringAt()` / `numbersAt()` helpers. If a
  shape needs reading, it needs a schema.
- Parse the whole envelope, then map to our own type in one `asX`
  function, so the API's spelling stops at the schema.
- A row that fails inside a list is dropped, not fatal: one unreadable
  track is not a failed album. A whole answer that fails to parse is
  fatal.
- `unknown[]` is only honest for genuinely heterogeneous things, such as
  console varargs, React `deps`, and styled-components interpolations.
  For anything from an API, write the type.

## Naming

- Files exporting a **React component** are PascalCase: `SongRow.tsx`,
  `TagInput.ts`.
- Everything else is camelCase: `draftStash.ts`, `pageState.ts`.
- Directories are camelCase, including `songTable/`, which contains
  `SongTable.tsx`.

## Comments

- Real JSDoc. A **one line** description, plus `@param`/`@returns` only
  where they say something the signature does not.
- Three lines is a ceiling, not a target. Delete a comment that restates
  the code.
- **No em dashes anywhere**, comments or strings. Standard English,
  Oxford comma.

## Architecture invariants

The detail is in `docs/architecture.md`; these are the rules that break
the build or the page when violated.

- **Two Reacts, never in one tree.** The page runs React 18; we bundle
  19. Nothing under `src/content/genius/` may import `react` or
  `react-dom`; `scripts/checkReact.mjs` fails the build on it. JSX there
  compiles to Genius's runtime through `@page-react/jsx-runtime`.
- **Borrowed components and hooks are slot-backed.** Import them like
  ordinary React from `geniusComponents/` and `geniusHooks/`; the slots
  are filled at mount. `styled` alone requires its importer to load
  after install, which is why `mount.ts` uses an eager dynamic import.
- `theme()` is a call, never a stored value.
- Chunk URLs and export names are read from the live `<head>` every
  load. Never hardcode a hash, a URL, or a Rollup export letter.
- Genius chunks are imported with `/* webpackIgnore: true */` so rspack
  leaves them alone.

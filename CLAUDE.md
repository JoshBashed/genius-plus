# Genius+ conventions

Editor tooling for Genius. Not a lyrics viewer for listeners.

## Toolchain

- **pnpm only.** Never npm or yarn, including registry lookups.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must all pass. Keep them green.
- **Run `pnpm typecheck`, never bare `tsc --noEmit`.** `src/content/genius/`
  has its own `tsconfig.json` for `jsxImportSource`, and the bare compiler
  skips that project silently.
- Emitted `dist/` filenames are referenced by `src/manifest.ts`. Renaming a
  source file must not move them.

## Style

- 80 columns, 4 space indent, double quotes, semicolons, trailing commas.
- **Arrow functions only.** The `function` keyword is a lint error.
- Strict TS: `verbatimModuleSyntax`, `noUncheckedIndexedAccess` (which is why
  `styled("div")` is required over `styled.div`), no `any`, no non-null
  assertions.
- **Spacing is flex and `gap`, never margins.** No `margin` for spacing, and
  no Tailwind `m-*`/`mt-*`/`ml-auto`. `margin: 0` to neutralise a user-agent
  default is the only exception.
- **Tailwind only** for our own UI. No hand-written CSS files. Configure in
  `tailwind.config.ts`, not with `@source`/`@theme` in the stylesheet.
- Every failure is a `Result` from `@resulted/results`, reusing `AppError` in
  `src/utilities/result.ts`. Never throw across a boundary.

## Naming

- Files exporting a **React component** are PascalCase: `SongRow.tsx`,
  `TagInput.ts`.
- Everything else is camelCase: `draftStash.ts`, `pageState.ts`.
- Directories are camelCase, including `songTable/`, which contains
  `SongTable.tsx`.

## Comments

- Real JSDoc. A **one line** description, plus `@param`/`@returns` only where
  they say something the signature does not.
- Three lines is a ceiling, not a target. Delete a comment that restates the
  code.
- **No em dashes anywhere**, comments or strings. Standard English, Oxford
  comma.

## Architecture, the parts that are not obvious

- **Two Reacts, never in one tree.** The page runs React 18; we bundle 19.
  Borrowed Genius components only work in theirs. Nothing under
  `src/content/genius/` may import `react` or `react-dom`;
  `scripts/checkReact.mjs` fails the build on it.
- **JSX there compiles to Genius's runtime** through
  `@page-react/jsx-runtime`, aliased in `rspack.config.ts` to
  `reactHost/jsxRuntime.ts`.
- **Borrowed things live in slots, read at the call.** Each module in
  `geniusComponents/` and `geniusHooks/` holds a `slot()` and exports a
  `setX` beside a wrapper that reads it when something renders or calls
  it. So they import like ordinary React (`import { TagInput }`,
  `import { usePusher }`), the barrel is safe, import order does not
  matter, and a re-prime reaches modules that were already imported.
- `mount.ts` fills the slots with `installAll([installs(getX, setX)])`,
  and `installOptional` for the ones a page can do without.
- **`styled` is the exception.** `styled("div")` has to return a
  component at module evaluation, so a styles module still has to be
  imported after the binding is installed. That is the only reason
  `mount.ts` reaches the table through `import(/* webpackMode: "eager"
  */ "./songTable")`.
- `theme()` is a call, never a stored value: `deviceType` changes on a
  resize and a re-prime replaces it without re-evaluating a module.
- Genius chunks are imported with `/* webpackIgnore: true */` so rspack
  leaves them alone. Different comment, different job.
- Chunk URLs and export names are read from the live `<head>` every load.
  Never hardcode a hash, a URL, or a Rollup export letter.

## Writing to Genius

- `PUT /albums/:id/bulk_update_songs` takes nine fields only: four artist
  arrays, `tags`, `release_date_components`, `primary_tag_id`, `language`,
  `recording_location`. Measured: anything else is
  `422 Unknown scalar field`.
- Media and title go through `PUT /songs/:id` with `{song: {...}}`.
- Writes need `X-CSRF-Token` from the `_csrf_token` cookie.
- Bulk writes are asynchronous. A 2xx means queued, not saved, and
  rejections arrive over Pusher, which is not implemented. Say "queued".
- Permissions are a string array on the song record. An **empty** array means
  unknown, not denied; only the per-song record populates it.
- Re-read before writing. A draft baseline is a snapshot, and clobbering
  another editor is a real lost update.

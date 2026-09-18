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
- **`mount.ts` primes, then eagerly imports the table.** `import(/*
  webpackMode: "eager" */ "./songTable")` keeps it in the same bundle, which
  a content script requires, while deferring evaluation until after
  `primeReactHost()`.
- **`geniusComponents/` may only be imported from inside that subtree.** Its
  modules snapshot their binding at module evaluation, which is legal only
  because the subtree evaluates after priming.
- **Never add `geniusComponents/theme.ts`.** A re-prime does not re-evaluate
  a cached module, and `deviceType` changes on resize, so theme must stay a
  late `host.theme.…` read.
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

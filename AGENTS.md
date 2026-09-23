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

## Toolchain

- **pnpm only.** Never npm or yarn, including registry lookups.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must all pass. Keep them
  green.
- **Run `pnpm typecheck`, never bare `tsc --noEmit`.**
  `src/content/genius/` has its own `tsconfig.json` for
  `jsxImportSource`, and the bare compiler skips that project silently.
- Emitted `dist/` filenames are referenced by `src/manifest.ts`. Renaming
  a source file must not move them.

## Commits

- **[Conventional Commits](https://www.conventionalcommits.org), subject
  line only.** `feat:`, `fix:`, `chore:`, `docs:`, `build:`, `ci:`,
  `refactor:`.
- **Incremental, never one big one.** A commit is one coherent step: the
  Apple Music reader, then the thing that reads with it, then the page
  that shows it. Slice until each step stands on its own.
- **One large commit is the last resort**, for a change that genuinely
  cannot be split, such as deleting a type every module imports. Having
  written the work in one go is not a reason; split it afterwards.
- **No body unless the commit earns one.** A small or obvious change is
  a subject and nothing else. A body is for a commit that had to be
  large, saying what a reader cannot get from the diff. Never a bulleted
  list of small things that should have been separate commits.
- Every commit passes `pnpm format`, `pnpm typecheck` and `pnpm build`
  on its own. Check each one out and run them rather than assuming.
- **A fix folds into the commit that introduced it**, while that commit
  is still on an unmerged branch. Never stack a fix on top for a
  reviewer to meet three commits later. Rewriting merged `main` is a
  different matter: ask first.

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

## Copy

Everything a reader sees: labels, buttons, notes, errors, and the store
listing. Follow MECA: What (M)atters, (E)mpathy, (C)ontext, and (A)ll.

## Avoid text where possible

Sometimes it's best to AVOID using text and rely on the interface to
convey information. This can reduce the mental load on the user and
point out what they need to go rather than reading an instruction. The
best user interfaces are intuitive enough to be navigated without text.

Example: a user didn't enter a date when a form requires it. 

Don't say:
* "Enter a day, month, and year in the release date fields."

The interface already has three fields, so mark the fields that have
issues and provide display a message (ideally a solution, such as
"Enter a day") next to the field.

### What (M)atters first

* Decide the most important thing the user needs to know and lead with
  it.

Example: you want to convey to the user that a critical security update
is available.

Don't say:
* "A new update is available that fixes a critical security issue. You
  should update now."
  * This doesn't convey urgency, give the user a clear next step, or
    lead with what they need to know.
* "A new security update has been released. Tapping here will let you
  update."
  * This uses passive voice and doesn't lead with what matters
    (updating).

Do say:
* "Critical security update available. Tap to update now."
  * This leads with what matters, conveys urgency, and gives the user a
    clear next step all while being concise.

### (E)mpathize with the user

* Imagine what it would be like as a first-time user after seeing your
  copy.
* Avoid apologetic language, such as "sorry", "uh oh", "oops", and
  "unfortunately". It can come across as insincere and frustrating to
  the user.
* Avoid filler words such as "please", "just", and "simply". They can
  make the copy longer than it needs to be and may come across as
  condescending. The action that they're trying to do might not feel
  simple to them. 
* Get to the point quickly. Avoid verbose explanations and unnecessary
  details.
* Avoid exclamation marks: they may come across as excitement. This can
  frustrate the user if they are not excited about the situation.

Example: you want to convey to the user that they cannot create more
than 10 songs in one hour.

Don't say:
* "Uh oh! You've reached the limit of how many songs you can create in
  one hour. Do wait a bit and try again later."
  * This uses apologetic language and is verbose.
* "Sorry, you can't create songs right now. You can't create more than
  10 songs in one hour. Please wait and try again later!"
  * This conveys what matters, but uses apologetic language and is
    verbose. It also uses an exclamation mark, which may come across as
    excitement in a situation that is frustrating to the user.

Do say:
* "You've created the limit of 10 songs in the last hour. Wait 20
  minutes to create more."
  * This conveys what matters, is concise, and gives the user a clear
    next step.

### (C)ontext is key

* Optimizing for the first-time user creates a baseline of simplicity.
* This may involve explaining concepts and features that are obvious to
  a power user.
* Avoid using jargon, acronyms, and abbreviations unless they are
  widely known and understood.

Example: you created a feature to check if an album is missing songs
with a link from Apple Music. You add a button to the album page.

Don't say:
* "Check"
  * This is too vague and doesn't convey what the button does. It lacks
    context.
* "AM Check"
  * Some may understand that this means "Apple Music Check", but many
    will not. It also doesn't convey what is being checked.
* "Missing Songs"
  * This would confuse the user. It could convey that the album page has
    missing songs when you're trying to convey that the button checks if
    the album is missing songs.

Do say:
* "Check for missing songs"
  * This is clear, concise, and conveys what the button does. Although
    it doesn't include "Apple Music", the user would likely figure that
    out in the next step after tapping the button (such as a modal or a
    new page).

### Write for (A)ll

* Use plain language. Avoid idioms, humour, and phrases that exclude
  people as these can be misread, may not translate, and can be
  offensive.
* Avoid jokes, especially ones that re-enforce stereotypes.
* Avoid adjectives and adverbs that assume something about the reader's
  situation.

Example: you want to convey to the user that Genius did not answer a
request.

Don't say:
* "Like a white rapper, this one is rare. Please try again later."
  * This uses a joke that may be offensive to some users and may not
    translate well.
* "Ugh, that didn't work. Please try again later!"
  * This is meant to be humorous, but it may just frustrate the user
    more because their action has been interrupted.

Do say:
* "Unable to connect to Genius. Try again in a few minutes."
  * This states the problem plainly and gives the user a next step,
    without a joke and without assuming how the reader feels about it.

### Terminology

* Use one word for one thing, everywhere: the interface, the errors, the
  documentation, and the store listing.
* Where Genius has a word for something, use theirs. The reader is
  already reading their interface, and a second word for the same thing
  reads as a second thing.
* Never invent a word for something that already has one.
* These words are ours and never reach the reader: stash, slot, chunk,
  baseline, task, verdict, queued, patch, draft. Each names part of how
  this works, which is not something anybody else has.
  * Not "no verdict arrived", but "could not verify that the change was
    saved".
  * Not "10 songs queued", but "saving 10 songs".
* Keep the two sides apart. Apple and Genius describe the same album
  with different words, and collapsing them hides which one is being
  talked about.

| Thing | Say | Not |
| --- | --- | --- |
| An entry on an Apple Music album | track | song |
| A song on Genius | song | track, entry, row |
| A name Apple lists against a track | contributor | credit |
| A Genius artist page | artist | contributor |
| The ordered songs of an album | tracklist | track list, song list |
| The one tag that categorises a song | primary tag | genre |
| Every other tag | tag | secondary tag, non-primary tag |

Example: the import reads an album from Apple Music and puts it on
Genius.

Don't say:
* "Apple lists 10 songs."
  * Apple lists tracks. A song is the thing that exists on Genius, so
    one word for both hides which side is being described.
* "3 artists could not be matched."
  * An artist is a page on Genius. The thing without a match is a
    contributor Apple named, which an artist is then chosen for.

Do say:
* "Apple lists 10 tracks. 3 will be created as songs."
  * Each side keeps its own word, so it is clear what already exists
    and what is about to.

### Errors

* Errors generally should indicate how to fix the issue where possible.
* Imagine the position of a user trying to do an action and failing. It
  is frustrating to be blocked without knowing why or what to do next.
* Never blame the user for what the software could not do.
* A status code is not a message. "Error 422: Unprocessable Entity" is
  not acceptable as an error message.
* Most errors should be displayed as "Kind: detail".
  * "Network error: could not resolve genius.com."
  * "Request error: failed to parse the response."
  * "Rate limited: try again in 5 minutes."
* Avoid "unknown error" where possible. Where nothing is known beyond
  the failure, explain that their action failed. This should almost
  NEVER be used.
  * "Could not save this song."
* Where there is both a next step and a supporting detail, the step
  comes first and the detail goes in parentheses after it. Context is
  never the most relevant thing.
  * "Rate limited: try again in 14 minutes (120 of the 100 request
    limit in the last hour)."
* Avoid (where possible) using the message from the server. It can't be
  localized and may not match our writing convention.
* Don't provide false confirmations.
  * Don't say "saved" until it is actually saved.
* Offer a retry only where retrying could work.

Example: Genius refuses a song because its release date is incomplete.

Don't say:
* "Something went wrong."
  * The user learns nothing and can do nothing.
* "Error 422: Unprocessable Entity"
  * A status code does not explain the problem. The reader cannot act
    on it.
* "You entered the release date wrong."
  * This blames the user for a rule they were never shown.
* "Release date was rejected: a day, month, and year are all required."
  * The field is on screen. Marking it is the interface's job, and
    naming it in a sentence covers for a screen that does not.
* "A day, month, and year are all required."
  * This is a rule, not a next step.

Do say, on EACH release date field itself:
* "Enter a day", "Enter a month", and "Enter a year" respectively.
  * The field carries which, so the sentence is only the rule that was
    broken.

Example: a bulk save is accepted but has not been applied yet.

Don't say:
* "10 songs saved."
  * They are accepted, not saved. Some may still be rejected, and
    saying otherwise means the user stops watching.

Do say:
* "Saving 10 songs..."
  * This is accurate about what is known. Each row shows its own
    progress, so nothing has to say where to look.

### Voice

* Use second person: "you" and "your" instead of "we", "us", or "our".
* Don't refer to the software where possible.
* Use sentence casing.
* End with "..." while an action is running and the text will be
  replaced when it finishes: "Saving 10 songs...", then "10 songs
  saved". Text that is not going to change does not get one.
* Use standard English. Do not use ", FANBOY" for dependent clauses.
* Use professional, neutral language.
  * 

## Architecture invariants

The detail is in `docs/architecture.md`; these are the rules that break
the build or the page when violated.

- **Two Reacts, never in one tree.** The page runs React 18; we bundle
  19. Under `src/content/genius/`, `react` resolves to theirs:
  `react/index.ts` at build time and `@types/react-18` in the editor.
  `react-dom` is refused; `scripts/checkReact.mjs` fails the build on
  it, and on any React of ours in those bundles. JSX there compiles
  to `react/jsx-runtime`, which resolves to `react/jsxRuntime.ts`.
- **Borrowed components and hooks are slot-backed.** Import them like
  ordinary React from `geniusComponents/` and `geniusHooks/`; the slots
  are filled at mount. `styled` alone requires its importer to load
  after install, which is why each loader uses an eager dynamic import.
- `theme()` is a call, never a stored value.
- Chunk URLs and export names are read from the live `<head>` every
  load. Never hardcode a hash, a URL, or a minified export letter.
- Genius chunks are imported with `/* webpackIgnore: true */` so rspack
  leaves them alone.

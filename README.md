# Genius+

A Chrome extension (Manifest V3) of editor tooling for Genius, built
around two jobs that come up constantly when sourcing a song page.

## Features

### 1. Clean SoundCloud links

SoundCloud decorates every link it hands you: `?si=` share ids,
`utm_source=clipboard`, and `?in=user/sets/playlist` when you arrive from
a playlist. None of that belongs in a Genius reference link.

Copying a SoundCloud link anywhere on the site now yields the bare URL.
This is covered from three angles, because SoundCloud copies links in
more than one way:

| Where the copy happens | How it is intercepted |
| --- | --- |
| Select text, ⌘C | `copy` listener rewrites the clipboard payload |
| Share sheet copy button | `navigator.clipboard.writeText` patched in the page's own world |
| The share sheet's text field | The field's value is rewritten in place |

`secret_token` is deliberately preserved; stripping it would break
private track links outright. Everything else goes.

Optionally (off by default) the address bar is rewritten too, so the URL
is already clean before you copy it.

### 2. Full quality artwork as PNG

Hover any cover on SoundCloud or Apple Music and a **PNG** button
appears in its corner. It resolves the highest real resolution available,
re-encodes to PNG, and saves it.

Resolving "highest quality" is per-site, and the rules are not obvious:

- **Apple Music** renders any size you ask for and *does not clamp to the
  master*. Requesting `6000x6000bb.png` genuinely returns a 6000×6000
  file, a 46 MB upscale of a 3000 px source that takes 91 seconds to
  render. Since there is no size that means "the original", it asks for
  `1024x1024bb.png`: comfortably above the 1000 px Genius displays cover
  art at, and a fast download.
- **SoundCloud** names sizes in the filename. `-original.jpg` is the
  untouched upload (typically 3000×3000) and is a genuine master.
Each site's candidates are tried best-first; the first one that downloads
*and* decodes wins, so a missing `-original` falls back gracefully rather
than failing.

## Architecture

```
src/
  manifest.ts              typed manifest, emitted at build time
  background/              service worker: CORS fallback image relay
  content/
    shared/                hover tracking, shadow-root overlay, labels
    soundcloud/            link cleaning (isolated + main world) + artwork
    appleMusic/            artwork
    genius/                bindings host for the album tools
  utilities/               result types, messaging, settings, URL rules
  popup/                   settings UI
```

A few decisions worth knowing:

- **The manifest is TypeScript.** `src/manifest.ts` exports a typed
  `chrome.runtime.ManifestV3`, and a small rspack plugin emits it to
  `dist/manifest.json`. Match patterns are shared with the content
  scripts, so the two cannot drift.
- **Two worlds on SoundCloud.** An isolated content script owns settings
  and the `copy` event; a second script runs in the page's own world
  because `navigator.clipboard` is not shared across worlds. The isolated
  half posts the enabled flag over `postMessage`, since the main world
  has no `chrome.*` APIs.
- **Overlays live in a shadow root** on a fixed, click-through host, so
  nothing can shift the host site's layout or capture its clicks.
- **No `downloads` permission.** Saving goes through an object URL and an
  anchor click, which keeps the permission list to `storage` plus hosts.
- **The image relay is not an open proxy.** The worker only fetches from
  the two image CDNs it holds host permissions for.
- **Errors are `Result`s**, via [`@resulted/results`]. The type carries
  its helpers on a prototype, which the messaging layer drops during
  serialisation, so results that cross that boundary are revived on
  arrival (`src/utilities/result.ts`).

[`@resulted/results`]: https://github.com/JoshBashed/resulted-results

## Development

```sh
pnpm install
pnpm dev      # rspack watch build into dist/
pnpm build    # production build
pnpm check    # biome + tsc
```

Then load `dist/` at `chrome://extensions` with developer mode on.

### Toolchain

- **rspack** for bundling, with **SWC** (`builtin:swc-loader`) doing all
  TS/TSX transforms. No separate `@swc/core` dependency is needed:
  rspack embeds SWC natively.
- **Tailwind v4** via PostCSS, configured in `tailwind.config.ts`. It is
  compiled to a *string* rather than a `<link>` tag, because content
  scripts inject it into a shadow root. Tailwind emits `:root, :host`, so
  theme variables resolve there.
- **Biome** for lint and format: 80 columns, 4 spaces, and arrow
  functions only (`useConsistentFunctionStyle` plus `useArrowFunction`
  make `function` an error).
- **TypeScript** in `--noEmit` mode purely as a typechecker.

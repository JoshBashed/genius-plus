# `src/bindings`

Typed, failure-tolerant handles on **Genius's own React bundle**.

Genius's React pages are built with Vite/Rollup and shipped as **native ES
modules**. There is no webpack runtime, no `__webpack_require__`, no module
registry to reach into. What there *is* is a browser module map keyed by
resolved URL, so if we call `import()` on the exact absolute URL the page
already imported, the browser hands back **the same module instance**. Same
React, same styled-components `ThemeProvider`, same redux store. Components
borrowed this way are not lookalikes; they are the page's components.

Everything here runs in the **MAIN world**. There is no `chrome.*` in this
directory and there must never be.

---

## The one rule

**Every URL is read out of the live `document.head` at runtime, on every page
load. Nothing about Genius's bundle is baked into our build.**

Genius redeploys constantly, and every redeploy rewrites every filename hash.
A hardcoded URL, hash or export name is a binding that breaks silently on
their next ship. `discovery.ts` enumerates `link[rel=modulepreload]` and the
entry `script[type=module]` instead, so we always get whatever version the
page is actually running, with zero extension updates.

**Every hash in this document is stale by definition.** They are quoted only
to show which build these notes were read out of, and they will not match
what you see on the site today. If you find yourself copying one into code,
stop.

---

## Layout

| File | Responsibility |
| --- | --- |
| `types.ts` | `PageComponent` / `PageElement` / `PageContext` brands, `ModuleNamespace` |
| `discovery.ts` | `detectPage()`, the live `<head>` chunk index, `resolveChunk` |
| `loader.ts` | `loadChunk()`: memoised native `import()` of the discovered URL |
| `finders.ts` | Shape-based export finders. Nothing is looked up by name |
| `react.ts` | `getReact`, `getReactDom`, `getReactDomClient`, `getJsxRuntime` |
| `styled.ts` | `getStyledComponents()`: `styled`, `ThemeProvider`, `ThemeContext`, `useTheme`, and `GeniusTheme` |
| `components.ts` | One typed accessor per borrowed component |
| `hooks.ts` | One typed accessor per borrowed hook |
| `index.ts` | Barrel |

---

## `detectPage()`: three outcomes, not two

The React album page is behind an **A/B experiment**. A signed-out or
unbucketed account gets the legacy Rails-rendered page, where none of these
modules exist. That is normal, so it is a *variant*, not an error:

```ts
const page = detectPage();

if (page.isErr()) {
    // Genuine failure (or not genius.com at all).
} else if (page.value.kind === "legacy") {
    // Expected: warn the user that Genius+ needs the new React album page.
} else {
    // page.value.chunks is the live index; go.
}
```

The primary test is *the entry module script plus its modulepreloads*,
because that is exactly what loading depends on. `__PRELOADED_STATE__`,
`__APP_CONFIG__`, `#application`'s `__reactContainer$…` key and
`<style data-styled="active">` are recorded in `page.value.markers` as
corroboration and for error text, but never gate the verdict.

## Base names are the API

A chunk is addressed by its **base name**, the filename with `-<hash>.js`
stripped. The hash is eight url-safe base64 characters and **may itself
contain `-` or `_`**, so the suffix is matched by length, never by splitting
at the last dash. Real filenames that break the naive rule:

```
DfpAd--Qdiv3w9.js              → DfpAd
useAnnotationTracking-yO-mWg-c.js → useAnnotationTracking
redux-toolkit.modern-CPj8i4Bs.js  → redux-toolkit.modern
```

Verified against all 125 chunks in one build: the length-anchored rule
strips every one correctly. It also surfaced that **base names are not
unique**: that build shipped four different `index-<hash>.js` chunks, plus
two `debounce` and two `pick`. `ChunkIndex.duplicates` records those, and
`resolveChunk` refuses them rather than picking one at random.

`resolveChunk` tries the exact base name first, then a *unique* prefix
match, so a change to Genius's hash length degrades one lookup instead of
all of them.

## Why the absolute URL matters

`loadChunkUrl` passes the discovered URL to `import()` unchanged. Do not
"tidy" it into a relative path. The module map is keyed by resolved URL;
the identical string is the entire reason we get the page's *instance* of
everything. A different string silently gives you a second React and a
second styled-components: components that mount, render, and are unstyled,
contextless, and invisible to the page's state.

The `import()` carries `/* webpackIgnore: true */` so rspack leaves it as a
native dynamic import rather than rewriting it into its own chunk loader.
That comment is load-bearing.

---

## Finder keys, strongest first

### 1. styled-components `displayName`: the good one

Genius runs the styled-components babel/vite plugin with `displayName`
enabled **in production**. Live class names read `Track__Link-sc-c5c30740-2`,
and the chunks confirm it:

```js
styled.button.withConfig({
    displayName: "Button__Container",
    componentId: "sc-b3067970-1",
})
```

Two consequences:

- `displayName` and `styledComponentId` survive minification, so
  `findByDisplayName` is a genuinely reliable key.
- The `<File>__<Component>` convention means **components are named after
  their source file**. When a multi-export chunk hides the component you
  want, look at which export owns statics prefixed `Foo__`:
  that is `findByStyledNamespace`, and it identifies components Genius
  never gave a `displayName` at all.

`displayNameOf` also looks through `memo(...)`'s `.type` and
`forwardRef(...)`'s `.render`, and `normaliseDisplayName` collapses
`"forwardRef(Button)"` to `"Button"`.

### 2. `propTypes`

Genius still ships `prop-types` in production, so **declared prop names
survive the build**. A distinctive handful of them identifies a component
with neither a `displayName` nor named statics. This is also where the prop
interfaces in `components.ts` come from.

### 3. Structural markers

`$$typeof` (`react.memo`, `react.forward_ref`, `react.context`),
`styledComponentId`, and key-set matching for namespace objects.

### 4. Source sniffing: fallback only

`Function.prototype.toString()` on a minified function. Minifiers rename
locals but **never member names or string literals**, so `x.useContext(` and
`"sc-global-"` both survive. Used only where nothing better exists, and
marked as such below.

### Ambiguity is an error

`selectExport` collects *all* matches. Two export letters pointing at the
same object are deduped by identity (Rollup re-exports one binding under
several names constantly). Two *different* objects are reported as an error
naming both keys. Returning the wrong component is far worse than returning
nothing.

---

## What was found, per chunk

Read out of real chunk source, then **executed**: a Node harness imported
each chunk from the shipped CDN files and ran the finders in this directory
against the real module namespaces. All 33 bindings below resolved to the
export identified by hand.

Build these notes were taken from, **already stale**:
`reactAlbumClient-PUWxCJx7.js`.

### Components

| Chunk | Real exports | The component | Finder key |
| --- | --- | --- | --- |
| `Button` | `B` | `B`: `forwardRef`, `displayName = "forwardRef(Button)"`; statics `Subtitle`, `Container`, `Spinner` | `displayName` → `Button` |
| `SmallButton` | `S` | `S`: `memo(forwardRef(SmallButton))` | `displayName` via `.type` |
| `LinkButton` | `L` | `L`: styled `button.attrs` | `displayName` → `LinkButton` |
| `TextInput` | `T` | `T`: styled `input.attrs`, `sc-aa108605-0` | `displayName` → `TextInput` |
| `Checkbox` | `C`, `c` | `C`: styled `input.attrs`. `c` is a checkmark data-URI builder | `displayName` → `Checkbox` |
| `Spinner` | `S` | `S`: `memo(styled(svg))`, `displayName = "Spinner"` on the inner styled component | `displayName` via `.type` |
| `TagInput` | `A B C D F M S T a b c d e f g u` (16) | `T`: `forwardRef`, `displayName = "forwardRef(TagInput)"` | `displayName` → `TagInput` |
| `SelectInput` | `S`, `r` | `S`: a plain arrow with **no displayName**; `r` is an unrelated `range` helper | statics prefixed `SelectInput__` |
| `Field` | `A a b c d e F` | `F`: `memo(Field, areEqual)`, **no displayName**; `a` to `e` are the `Field.shared__*` styled parts | `propTypes` ⊇ `wrapWithLabel`, `transformForForm`, `isInputControlled`, `asFieldset` |
| `Dropdown` | `D` | `D`: `memo(Dropdown)`; statics on `.type` | statics prefixed `Dropdown__` |
| `DropdownList` | `D` | `D`: plain arrow, no displayName | statics prefixed `DropdownList__` |
| `DiscographyItemList` | `D`, `a` | `a`: `memo`, `displayName = "DiscographyItem"`; `D`: the list, no displayName | `displayName` / statics prefixed `DiscographyItemList__` |
| `useAvailableRoles` | `D`, `a`, `u` | `a`: `memo(DateInput)`. `D` is `DateField`, `u` is the hook the chunk is named after | `displayName` via `.type` → `DateInput` |
| `MetadataRow` | `M`, `a` | `a`: MetadataRow; `M`: MetadataField. **See the trap below** | responsive-pair probe |
| `EditMetadataModal` | `E R S a s u` | `E`: the modal shell, no displayName; `S`: `ScrollableTabs`; `R`: `RepeatableInputPair` | `propTypes` for `E`, `displayName` for `S`/`R` |

Note the export letters are pure noise: `E`, `R`, and `S` bear no relation
to the names, and they churn per deploy. That is the whole reason nothing is
looked up by name.

#### `DateInput` vs `DateField`

`DateField` is what the album page's release-date row is built from, but
it is a react-hook-form `Controller` wrapper: rendered outside a
`FormProvider` it throws. `DateInput` is the plain controlled component
underneath (`{ year, month, day, onChange }`), and that is what
`getDateInput` binds. Genius's own `NameAndArtists__DateField` is only

```js
styled(DateField)`
    ${DateInput.Root} { display: grid; grid-template-columns: 3fr 2fr 2fr;
                        gap: ${theme.space.half}; }
    ${SelectInput.Container} { margin-right: 0; }
`
```

so recreating the layout over `DateInput` costs four lines. Note that
`DateInput.Root` is a static on the *inner* component and `memo()` does
not copy statics, so reaching it from the export means going through
`.type`; `unwrapMemo` does that.

#### Not everything is context-free

Borrowed components read more than the theme:

| Component | Also needs |
| --- | --- |
| `DateInput` | react-redux context (`useIsMobile` → `useSelector`) and i18n for its placeholders |
| `TagInput`, `SelectInput`, `TextInput` | styled-components `ThemeContext` only |

A fresh `createRoot` has none of them. Replaying the page's own context
provider values around the subtree is the only approach that scales:
read them off the live fiber tree rather than trying to rebuild each
provider by hand.

#### The `MetadataRow` trap

Both exports are built by `createDeviceComponent`, which wraps a
desktop/mobile pair in one styled `div` whose `attrs` swaps the rendered
`as` on `theme.deviceType`. **Every** such component in the bundle therefore
shares one `displayName` (`createDeviceComponent__createDeviceStyled`) and
one `componentId` (`sc-d7a61a05-0`), so `displayName` cannot tell them
apart.

`findDeviceComponent` calls the `attrs` function with
`{ theme: { deviceType: "mobile" } }` and reads the `displayName` off the
component it hands back: `MetadataRow__MetadataRowMobile` vs
`MetadataField__MetadataFieldMobile`. The attrs function builds a plain
object literal, so probing it has no side effects. This is the one finder
that *runs* page code; if it ever stops working, that is why.

### Hooks

Genius compiles one hook per file, so most of these chunks have a single
export and `findHook` takes it on sight.

| Chunk | Real exports | Finder key |
| --- | --- | --- |
| `useEntityForm` | `u` | sole export |
| `useTheme` | `u` | sole export |
| `useToast` | `u` | sole export |
| `useCurrentUser` | `u` | sole export |
| `useFormValidationState` | `i`, `u` | **arrow vs `function` declaration** |

`useFormValidationState` is the interesting one. It shares its chunk with an
`isEmpty` helper, and source sniffing fails on it: the hook's body mentions
no `use…(` call (the `useFormContext` it calls is aliased to a single
letter). The tell is that Genius writes hooks as **arrow functions**, which
have no `prototype`, while the helper is a `function` declaration, which
does. `useCurrentUser` has the same problem (its body is just
`useSelector(s => …)` with `useSelector` minified away) and is saved by
being a sole export.

### React

All of React, react-dom, react-dom/client, and the jsx runtime live in one
`react-vendor` chunk. **React 18.3.1**, so `Symbol.for("react.memo")` and
friends are the React 18 spellings.

| Binding | Finder key |
| --- | --- |
| `getReact` | has `createElement` + `useState` + `version`, **lacks `default`** |
| `getReactDom` | has `createPortal` + `flushSync` + `version` |
| `getReactDomClient` | has `createRoot` + `hydrateRoot`, **lacks `createPortal`** |
| `getJsxRuntime` | has `jsx` + `jsxs` + `Fragment`, **lacks `createElement`** |

Two subtleties worth keeping:

- The chunk re-exports React *three* ways: the CommonJS namespace, its
  default (literally the same object, so identity dedupe handles it), and a
  Rollup interop namespace that adds a `default` key. Only the last has one.
- react-dom 18 also exports `createRoot`, so react-dom/client is identified
  by what it *lacks*.

### styled-components 5.3.11

| Binding | Finder key | Confidence |
| --- | --- | --- |
| `styled` | callable **and** `styled.div` / `styled.span` are functions | solid |
| `ThemeContext` | `$$typeof === Symbol.for("react.context")` | solid |
| `useTheme` | arity 0, source mentions `useContext` | good |
| `ThemeProvider` | source mentions `useContext` + `useMemo`, not `forwardRef` | **heuristic** |
| `keyframes` | rest-arg preamble **and** `.join("")` | **heuristic** |
| `css` | rest-arg preamble, no `.join("")`, no `"sc-global-"` | **heuristic** |

`css`, `keyframes`, and `createGlobalStyle` share an identical
rest-argument preamble, so they are separated by what each does with it.
This is the most fragile corner of the directory; it is also the first
thing to check if theming breaks after a deploy.

`GeniusTheme` in `styled.ts` lists only theme keys actually seen referenced
in chunk source (`color.background.on`, `space.half`, `fontSize.reading`,
`lineHeight.xShort`, `theme.inputActive("css")`, …). The nested records keep
index signatures because the real theme has more. Add a named key when you
have read it somewhere, not because it sounds plausible.

---

## Using it

### Two Reacts

We bundle React 19; the page runs React 18. They share no hooks, no
context, and no reconciler, and mixing them produces a subtree that renders nothing
and reports nothing. `PageComponent` / `PageElement` / `PageContext` are
**branded** precisely so a borrowed component is not assignable to our own
`ComponentType`: the mistake is a compile error instead of an empty div.
Render borrowed components through `getReact()` or `getJsxRuntime()`.

### Theme context does not come for free

styled-components reads its theme from React context, which flows down the
*React* tree, not the DOM tree. A separate `createRoot`, or a portal out of
one, has no `ThemeProvider` ancestor, so borrowed components render
unstyled. To get Genius's look you must wrap your subtree in **their**
`ThemeProvider` (from `getStyledComponents()`) with a real theme object.
Their own code does exactly this in `DropdownList`, which re-wraps its
portal content in a `ThemeProvider` before rendering.

### Everything is a `Result`

Nothing here throws. Failures are `AppError` of kind `"binding"`, carrying
`target` (what we were looking for) and `reason` (what we saw instead),
including the chunk's actual export keys, or every key that matched when a
finder was no longer specific enough. When Genius redeploys and something
breaks, that string is the entire debugging surface, so keep it specific.

Accessors are memoised **on success only**. A script can run before `<head>`
is complete, and caching a miss would poison every binding for the rest of
the document's life. Call `resetBindings()` after a client-side navigation.

---

## Re-checking after a deploy

The CDN is not Cloudflare-gated even though `genius.com` is, so chunks can
be read with plain `curl`:

```
curl -s https://assets.genius.com/javascripts/compiled/<name>-<hash>.js
```

Pull the current filenames off a live page's `<head>` first. Walking the
`import` statements gives the full dependency closure, which is enough to
import the chunks in Node behind a handful of DOM stubs and run the finders
in `finders.ts` against the real namespaces. That is how the table above was
verified, and it is the fastest way to find out which finder a deploy broke.

# Genius API, as measured

Every shape here comes from a **captured live request**, not from reading
their bundle. Inference was wrong three times; captures were right first
time. Before adding or changing a payload, ask for a real DevTools request
and record what it said, in this file.

## Auth and envelopes

- Writes need `X-CSRF-Token` from the `_csrf_token` cookie.
- **Every write sends `text_format` at the top level**, a sibling of `song`
  or `album`, because their own POST and PUT helpers merge it in. `apiPut`
  and `apiPost` (`src/content/genius/api.ts`) do this for you.
- **A rejection puts the only useful line in the body**, not the status:
  `response.errors` for the record, `response.validation_errors` keyed by
  field with `base` for the rest, and `meta.message` as the summary. The
  server names `release_date` where the body key is
  `release_date_components`. `apiGet`/`apiPut` parse before judging the
  status, so an `http` error carries `messages`.

## Updating songs

- `PUT /albums/:id/bulk_update_songs` takes nine fields only: four artist
  arrays, `tags`, `release_date_components`, `primary_tag_id`, `language`,
  `recording_location`. Measured: anything else is
  `422 Unknown scalar field`.
- Media and title go through `PUT /songs/:id` with `{song: {...}}`.
- Bulk writes are asynchronous. A 2xx means queued, not saved. Verdicts
  arrive over Pusher as `bulk-song-update-status` events naming the task:
  `src/content/genius/bulkStatus.ts` parses them and
  `songTable/TaskWatch.tsx` subscribes per task. Until a `completed`
  event lists a song in `updated_song_ids`, say "queued", never "saved".
- Permissions are a string array on the song record. An **empty** array
  means unknown, not denied; only the per-song record populates it.
- Re-read before writing. A draft baseline is a snapshot, and clobbering
  another editor is a real lost update.

## Creating songs

- **There is no album creation endpoint.** `/albums/new` is a 404 and no
  `create_album` exists in any bundle. An album is born by naming a new
  one on a song: `albums: [{ name, _new: true }]`. The `_new` marker is
  theirs.
- `POST /api/songs` takes `{ text_format, song: {...}, recaptcha_token }`.
  Their form posts **only the fields that have values**, eight of
  thirteen, and omits every empty one. `primary_artists` entries carry
  `{id, name}`, never the id alone. `tags` mirrors the primary tag as
  `{id, name, isLocked: true}`. `lyrics: ""` is real: their client only
  runs the DOM-tree transform when the string is not empty.
- **`recaptcha_token` is required, and Genius's own hook mints it.**
  See "reCAPTCHA on song creation" below.

## The tracklist

- `PUT /albums/:id/tracklist` orders the album. The **React** page sends
  `{ tracklist: [{ disc_number, disc_track_number, song_id }],
  viewable_by_roles: [], react_album_page: true }`. The legacy Angular
  page sent a flat `track_number`, which this endpoint ignores, so discs
  are real and numbering is per disc.
- It replaces the whole tracklist: a song left out is taken off the
  album, so every existing one is carried through.
- **`viewable_by_roles` is carried through, not emptied.** The capture
  reads `[]` because that album was unrestricted. Sending `[]` to an
  album that is restricted would lift the restriction, so the album's
  own `viewable_by_roles` is read first and sent back.
- **Its answer binds created songs.** `album_appearances` names a song
  per position, and the entries went out in that order, so position is
  what pairs an Apple track with the song it made. Pairing by title put
  two tracks whose names normalise alike on one song id.
- `GET /albums/:id/tracks?page=&per_page=` is the read-back. It answers
  `{tracks: [{number, disc_number, song}], next_page}` and carries the
  tracklist, not the metadata: per-song reads still happen one at a time.

## The album record

- `PUT /albums/:id` sets the album's own record:
  `{ album: { cover_arts: [{ image_url }], release_date_components,
  language, album_type } }`. `album_type` is one of album, ep, single,
  mixtape.
- **Album URLs are `/albums/<artist-slug>/<album-slug>`.** `/albums/<id>`
  is not a path Genius serves, so redirect to the record's own `url`.
- `PUT /albums/:id` with `album.cover_arts` is the whole of setting art;
  the `/cover_arts` REST family is the legacy page's. **The array is the
  whole set**: an entry omitted is art deleted, and index 0 is the cover
  shown, so re-read before writing exactly as with the tracklist.

## Cover art through Filestack

- Credentials are already on the page: `__PRELOADED_STATE__.config`
  (camelCase) over `__APP_CONFIG__` (snake_case) carry
  `filepickerApiKey`, `filepickerPolicy`, `filepickerSignature`,
  `filepickerPath`, and `filepickerCdnDomain`. The policy is minted per
  render, lasts seven days, and only appears for a signed in session.
  There is no credential endpoint.
- `storePath` is `filepickerPath + "/" + <random base36>`, which the
  policy's own `path: "<hex>/*"` constrains. The finished URL is
  `https://<filepickerCdnDomain>/<encodeURIComponent(storePath)>`, and
  Genius re-hosts it afterwards, so that URL is only an ingest handle.
- **The upload is one call, not the captured four.** Their dialog does a
  multipart start / part / end because it streams a file the reader
  picked; `POST https://www.filepicker.io/api/store/S3` takes the whole
  blob at once with the same credentials. `importPage/filepicker.ts`
  sends `?key&policy&signature&path&access=private&plugin=js_lib` with
  the blob under the form field **`fileUpload`**, which is the name their
  own `filestack.js` posts under (`api.filestackapi.com/filestack.js`,
  `constructStoreUrl` and the `FormData` beside it). No cookies: the
  signed policy is the whole of the auth.
- **Upload a PNG, always.** Their colour sniffing reads the stored file
  and gets it wrong on a JPEG, so `toPng` re-encodes whatever Apple
  served and the store call names `image/png` rather than leaving it to
  be guessed. Apple's own `.png` is asked for first, but the fallback is
  a JPEG, so the re-encode is what guarantees it and not the URL.

## reCAPTCHA on song creation

`POST /api/songs` is gated by reCAPTCHA v3 (action `create_song`). The
token comes from **Genius's own `useGoogleReCaptcha`**, borrowed through
a slot like every other binding and called in their page, in the signed
in editor's own session, under their own action string. `createSong`
takes a body whose token the caller supplies, and `FirstSongStep` is the
caller that supplies it.

Nothing here solves or stands in for a challenge. v3 is a score, not a
puzzle: Google scores the real session, Genius's server reads the score,
and both decisions stay theirs. The tool acts as the editor who is
sitting there, on their own account, through the site's own code path.

The line that does matter: never forge, replay, cache or reuse a token,
never stand in for a score, and never make a request look like it came
from a session or a user it did not. Genius's own Add A Song form stays
offered beside the direct path, which is the answer for a session that
cannot mint one and if they ever tighten this endpoint.

# Privacy policy

Genius+ collects nothing, sends nothing to its developer, and has no
server of its own.

Last updated 20 September 2026.

## What it stores

- **Your settings**, in `chrome.storage.sync`: four on and off switches.
  Chrome syncs these to your own Google account if you have extension
  sync turned on. Nobody else can read them.
- **Edits you have staged but not saved**, in the browser's own
  `localStorage` on `genius.com`, so closing a tab does not lose them.
  They stay on your computer, are keyed by album, and are cleared once
  Genius has stored them.

Nothing else is stored, and neither of these leaves your browser except
where you send it yourself.

## What it talks to

Every request goes to the service the feature is about, as you, from
your own browser:

- **genius.com**, to read and write the songs and albums you edit, in
  your own signed in session. This extension is a tool for editing
  Genius, so this is the whole of what it does.
- **itunes.apple.com** and **amp-api.music.apple.com**, to read an
  album, its tracks, and their credits when you import one. These are
  Apple's public catalogue endpoints and carry nothing about you.
- **mzstatic.com** and **sndcdn.com**, to fetch cover art you asked for.
- **www.filepicker.io**, which is the uploader Genius themselves use, to
  store a cover you are putting on an album.

There is no analytics, no telemetry, no error reporting, and no request
to any address belonging to the developer.

## What it never does

- Read or collect your browsing history, your bookmarks, or any page
  outside genius.com, soundcloud.com, and music.apple.com
- Read your password, your cookies, or your payment details
- Sell, share, or transfer anything to anyone
- Show advertising

## Questions

Open an issue at <https://github.com/JoshBashed/genius-plus/issues>.

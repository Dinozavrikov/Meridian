# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0 (a fully finished product),
a minor version marks a new feature and a patch marks a fix.
The project is under active development: some features are unfinished and may not work, and the data model, API and interface can change without notice.

## [Unreleased]

## [0.23.1] - 2026-11-28

### Changed
- The home page, documentation and features page now describe maturity, source diversity, calibration and undo as the code works, with practical examples.

### Fixed
- The server now rejects hypothesis maturity, risk, stability and research load values outside their scales.
- Linking two records in the opposite direction no longer creates a second link for the same pair.
- The evidence signal now reads an author's own links in a stable order.
- Social preview images now use both bundled PT Serif files, so Latin letters, digits and punctuation no longer depend on a font downloaded at render time.
- The idea check export buttons now say next to them why they are inactive, and stay reachable from the keyboard.
- Interface translations cached in the browser are dropped once their Russian source changes, and switching the language no longer leaves strings of the previous one on screen. Older interface caches are discarded once.

## [0.23.0] - 2026-11-26

### Added

- A public home page at the root address: it explains how the method works, what Meridian computes for you, what a record is, who it is for and what happens to your data, with a sample idea passport, has a header with links and a way to sign in or open the app, and every page of the site now has a link back to it; the root address no longer redirects to the feed
- Signed-in people get a way back to the home page: an About Meridian icon in the side menu and a row at the end of the mobile menu
- Registration is limited by address; after too many attempts a message asks to try again later
- An account that signs in only through Google can now set a password: "Forgot password" sends a link instead of a refusal
- The home page background shows a slowly drifting network of nodes. It stays still when the system asks for reduced motion and pauses while it is scrolled out of view.
- A sandbox on the home page: write a claim, pick how sure you are, and see which of the source, the refutation criterion and the deadline are still missing. The text stays in the browser, and the result can be downloaded or copied as Markdown.

### Changed

- The site description in search results and link previews now names the problem Meridian closes ("in half a year you will say I always knew it") and says what it does about it; the same wording is used in the page tags, the share tags and the structured data

### Fixed

- An account created in advance with someone else's e-mail no longer stays open to its creator after the owner signs in through Google: the old password is turned off, other sessions end, the owner gets a letter, and the records stay
- The registration page now shows the attempt limit message instead of a generic error, and its two check messages can be translated for guests
- Signing in through Google can no longer take over an account that is already linked to a different Google account with the same e-mail address: the sign-in is refused and nothing is changed
- A failed sign-in through Google now explains what went wrong on the sign-in page instead of showing an empty form, and a refusal from a blocked region or an expired Google session comes back to that page instead of a raw error
- Pinch-to-zoom works again on phones: the page no longer forbids changing the scale, which people with low vision need
- Text fields use a 16px font on touch screens, so iOS no longer zooms the page in when a field gets focus
- The drifting network background on the not-found and onboarding pages now stays still when the system asks for reduced motion, and moves at the same pace on 60 Hz and high refresh rate screens.

## [0.22.19] - 2026-11-23

### Added

- Sign-in and password reset attempts are limited by address, by name and by e-mail; after too many attempts a message asks to try again later, and a stranger from another address cannot lock the owner out

### Fixed

- The forgot-password page no longer says the e-mail was sent when the attempt limit is reached

### Changed

- The architecture notes describe the client address, feed previews, translation of record text with links and search sharing, and their guard test no longer finds names in the document itself

## [0.22.18] - 2026-11-22

### Fixed

- Link previews of section pages use the site image with the logo and the caption instead of a plain one-word card
- An uploaded avatar is shrunk to a small WebP; before, the original file was stored as it was and could weigh several megabytes for every visitor of the feed
- A broken avatar upload no longer removes the previous avatar

## [0.22.17] - 2026-11-22

### Fixed

- Section pages (feed, observations, hypotheses and others) have the page type and a share image with its size in their link previews; before, these tags were missing

## [0.22.16] - 2026-11-22

### Fixed

- The share image of a public record is drawn again: it answered with an error because its fonts were read in a way the server does not support
- A discussion page rendered while the backend is briefly unavailable is no longer kept without the record text

## [0.22.15] - 2026-11-22

### Added

- The text of a public record is in the server HTML of its discussion page, and the record title is the main heading of the page, so search engines see what the record says

### Fixed

- Public beliefs are listed in the sitemap again: they had been left out while their pages were hidden from search engines, which is no longer the case

## [0.22.14] - 2026-11-22

### Added

- Discussion pages of public records have their own share image with the title and the record type, and structured data for search engines; shared links show a large preview
- The observations, hypotheses, predictions and beliefs pages have their own title, description and canonical address

### Changed

- The sitemap lists only pages that have text for search engines and public records, without invented modification dates
- In feed cards the links inside a record text appear right after the page loads, so the server and the browser draw the same markup

## [0.22.13] - 2026-11-21

### Fixed

- Public beliefs without a title are no longer hidden from search engines: the title is taken from the text
- Shared links of discussion pages carry the site name and a Twitter card

### Changed

- The site root redirects to the feed permanently, and the sitemap lists the final addresses instead of the redirecting root

### Fixed

- Public beliefs without a title are no longer hidden from search engines: the title is taken from the text
- Shared links of discussion pages carry the site name and a Twitter card

### Changed

- The site root redirects to the feed permanently, and the sitemap lists the final addresses instead of the redirecting root

## [0.22.12] - 2026-11-21

### Fixed

- The graph button in feed cards is visible on phones: it is a full-width row with a caption and a counter instead of a hidden thumbnail

## [0.22.11] - 2026-11-21

### Fixed

- Links inside the text of a record in the feed work again: the card shows the record body and notes with their links instead of stripping them
- Feed previews are cut by visible text, so a link is no longer lost when the cut falls inside a tag

### Changed

- Translating a record in the feed keeps its links: tags are set aside before the model sees the text and put back from the original, so an address can never be altered by the translation

## [0.22.10] - 2026-11-21

### Fixed

- The client address is read from the proxy header in one place for sign-in sessions, country checks and the guest request limit; the guest limit is now counted per client

### Changed

- The README lists the host requirements and the current stack; the encryption key is generated with `openssl`, so Python is not needed on the host to start the app

## [0.22.9] - 2026-11-20

### Fixed

- The language and translation-mode menu is translated like the rest of the interface
- A guest now sees ready translations of public records (before, the request failed with 401 and the record stayed in the original language); the model never works for a guest, and private records and other record types are not returned
- The translation mode (interface, everything, content only) is remembered between page reloads; before, a reload silently switched content translation off
- A guest page that mixed sign-in strings with other texts got no translation for the sign-in strings; the model now translates the allowed strings and the rest comes from the cache
- The cache warm-up script can warm the sign-in strings (`--auth`) and takes the languages from the cache instead of a typed list

## [0.22.8] - 2026-11-20

### Changed

- The Russian interface dictionary is written without the letter yo, as the rest of the product texts; a test keeps it that way
- Error messages, e-mails, sign-in screens and scale labels no longer use the letter yo; statuses are stored as before and shown without it, and user-written text is never changed

## [0.22.7] - 2026-11-20

### Security

- The backend image now installs a patched pip instead of the one bundled with the base image

## [0.22.6] - 2026-11-20

### Security

- Test tooling (vitest) updated to 4.1.12, which closes the last known vulnerabilities in the frontend development dependencies

## [0.22.5] - 2026-11-19

### Security

- Frontend dependencies updated: no known vulnerabilities remain in the production dependency tree, including two critical ones (Next.js and DOMPurify)
- Backend dependencies upgraded (FastAPI, Starlette, cryptography, Pillow, python-multipart, aiosmtplib); JWT handling moved from python-jose to PyJWT, and tokens issued before the upgrade stay valid

### Fixed

- Tests that look up routes no longer walk the application route list directly (newer FastAPI nests included routers), so the route guard tests check every route again; a test now fails if a direct walk comes back
- A test that added a route to the shared application no longer leaves it behind for later tests
- The cache warm-up script failed on every run (it called the endpoint without a request); it now uses the shared translation function, and the test container mounts scripts so such tests run the current code
- New pages (documentation, privacy, terms) were translated last because the whole dictionary went in one long queue: strings the screen needs now go first, and a batch is limited by text volume
- A guest now sees ready translations of the interface from the cache (before, any page outside the sign-in screens got an error and no translation); the model never works for a guest

## [0.22.4] - 2026-11-19

### Fixed

- The public maturity simulator now rejects control characters in its input like the rest of the API

### Added

- ARCHITECTURE.md: how Meridian is put together, with a test that fails when the document refers to code that no longer exists or stores numbers that go stale
- The sitemap now lists public records (hypotheses, observations, predictions, questions, tasks) so search engines find them without crawling the feed; the backend gets a public list endpoint that returns only type, id and update time

## [0.22.3] - 2026-11-18

### Changed

- The footer tagline and description now match the project's current wording: ideas checked against reality

### Fixed

- Every public page had the same title and description; they now have their own, and a record page takes its title and description from the record (only public records are indexable)
- The default page description no longer uses a non-standard spelling of the word for "will come"

## [0.22.2] - 2026-11-18

### Fixed

- Public pages are now rendered before the session check finishes, so their text is in the server HTML (before, crawlers without JavaScript saw an empty screen)
- The public feed is now rendered on the server for the first page, so crawlers that do not run JavaScript see the records too (needs `INTERNAL_API_URL`, otherwise the feed loads in the browser as before); the feed page has its own title and description

## [0.22.1] - 2026-11-18

### Fixed

- Search engines saw an empty feed: `robots.txt` blocked the whole `/api/`, so a crawler that runs JavaScript could not load the public feed and record cards. The public read endpoints are now allowed; everything else under `/api/` stays closed

## [0.22.0] - 2026-11-18

### Added

- A support page (`/support`) with payment links, copyable crypto addresses and ways to help without money; the footer now links to it and to the source code on GitHub

## [0.21.1] - 2026-11-18

### Fixed

- Self-hosting in production: CORS origins and the Turnstile site key were fixed inside `docker-compose.yml`, so sign-up could not work on another domain; they now come from `.env` (CORS accepts a comma-separated list)
- Login cookies are now marked `Secure` automatically when `ENVIRONMENT=production` (before, this needed a variable that compose did not even forward)
- Risky production settings are caught at startup: a placeholder `SECRET_KEY` stops the backend; the test Turnstile secret, a local mail catcher and cookies without `Secure` are warned about
- A documented production setup: a Caddy reverse proxy overlay (`docker-compose.prod.yml`) that overwrites `X-Real-IP`, and a "Production deployment" guide in the README
- The frontend build now says explicitly that the API is reached at a relative address by default
- The Caddy proxy keeps retrying the connection for up to 20 seconds while the backend or frontend restarts (an update, `git pull`), instead of answering 502 to sign-up and login
- Startup warnings about risky settings are printed once per start instead of three times
- The backend no longer writes the visitor's IP address to its log during sign-up checks

## [0.21.0] - 2026-11-16

First public release. Development history before this point was condensed.

### Added

- Public feed with reposts, type filters and laboratory scoping
- Global community graph
- Predictions with confidence, outcomes and per-tag calibration
- Worldviews, questions and tasks as first-class entities linked to the rest
- Tools for honest thinking: falsification criteria, evidence diversity index, fact/interpretation classification, hypothesis maturity
- Background re-checking of contradictions
- Laboratories with roles, a unified access policy and a members' calibration leaderboard
- Results: rich editor, `meridian://` links, publish workflow
- File attachments: code, documents and other files
- Laboratory snapshots (checkpoints) with a hash-chained history
- Entity stages: an eight-step research track
- Change history with per-field undo
- Trash: soft delete, restore, permanent delete
- Private messages, encrypted at rest
- Accounts: email notifications, password reset, Google sign-in, Turnstile on sign-up
- Interface and content translation backed by a local model
- Automated encrypted backups with restore verification
- Redesigned entity pages, navigation and thematic feed; documentation, features, roadmap and privacy pages with a maturity calculator

### Security

- Login cookies are now marked `Secure` in production: `COOKIE_SECURE` is passed from `.env` to the backend container (it was not forwarded before)
- Image build contexts exclude `.env*` files at any depth

# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0 (a fully finished product),
a minor version marks a new feature and a patch marks a fix.
The project is under active development: some features are unfinished and may not work, and the data model, API and interface can change without notice.

## [Unreleased]

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

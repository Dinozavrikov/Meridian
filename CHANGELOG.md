# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0 (a fully finished product),
a minor version marks a new feature and a patch marks a fix.
The project is under active development: some features are unfinished and may not work, and the data model, API and interface can change without notice.

## [Unreleased]

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

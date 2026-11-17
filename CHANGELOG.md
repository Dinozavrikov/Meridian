# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0.0 (a fully finished product),
a minor version marks a new feature and a patch marks a fix.
The project is under active development: some features are unfinished and may not work, and the data model, API and interface can change without notice.

## [Unreleased]

## [0.21.0] - 2026-11-16

First public release. Development history before this point was condensed.

### Added

- Public feed with reposts, type filters and laboratory scoping
- Global community graph
- Predictions with confidence, outcomes and per-tag calibration
- Worldviews, questions and tasks as first-class entities linked to the rest
- Epistemic tooling: falsification criteria, evidence diversity index, fact/interpretation classification, hypothesis maturity
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

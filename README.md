# Meridian

An epistemic management platform: record what you observe, state hypotheses and predictions, link everything into a graph, and see how well your beliefs hold up over time.

Live: [Meridian, an epistemic management platform](https://miridin.com) · Russian version: [README.ru.md](README.ru.md)

## What it does

- **Entities:** observations, hypotheses, predictions, worldviews, questions and tasks, connected by typed links and a graph view.
- **Epistemic tooling:** falsification criteria, evidence diversity, fact/interpretation classification, hypothesis maturity, calibration of predictions, background re-checking of contradictions.
- **Laboratories:** shared workspaces with roles, a unified access policy, snapshots with a hash-chained history and a members' calibration leaderboard.
- **History and safety nets:** per-field change history with undo, a trash with restore, file attachments, results with a rich editor.
- **Local AI:** translation, classification, embeddings and image description run on your own Ollama instance. No external AI provider is used.
- **Privacy:** private messages are encrypted at rest, backups are encrypted and restore-tested.

See [CHANGELOG.md](CHANGELOG.md) for the full list.

## Stack

| Layer    | Technology                                       |
|----------|--------------------------------------------------|
| Frontend | Next.js, React, TypeScript                       |
| Backend  | FastAPI (Python 3.12), SQLAlchemy, Alembic       |
| Data     | PostgreSQL with pgvector, Redis                  |
| AI       | Ollama (local models)                            |
| Infra    | Docker Compose                            |

## Quick start (local development)

Requirements: Docker with Compose v2. Ollama is optional (needed only for AI features).

```bash
git clone https://github.com/Dinozavrikov/Meridian.git
cd Meridian
cp .env.example .env
cp docker-compose.override.example.yml docker-compose.override.yml
# generate secrets (the commands are also at the top of .env.example)
sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^POSTGRES_TEST_PASSWORD=.*|POSTGRES_TEST_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^MESSAGE_ENCRYPTION_KEY=.*|MESSAGE_ENCRYPTION_KEY=$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')|" .env
docker compose up -d --build postgres redis mailpit backend recheck-worker frontend
```

- App: http://localhost:3000
- API: http://localhost:8000
- Mailpit (catches outgoing email): http://localhost:8025

Database migrations run automatically when the backend container starts.

### AI features

The backend talks to a local Ollama at `http://host.docker.internal:11434`. The default chat model name is `qwen2.5-custom`, a custom model that is not published, so point the backend at any chat model you have: set `OLLAMA_MODEL` (and `OLLAMA_URL` if needed) in `.env`. Per-task model routing is described in [backend/docs/LLM_ROUTING.md](backend/docs/LLM_ROUTING.md). Without Ollama the app runs, but AI-assisted features are unavailable.

### Google sign-in (optional)

Disabled unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Whoever runs a public instance is responsible for complying with the laws of their jurisdiction, including any restrictions on third-party sign-in providers (for example, Russian regulations on foreign authentication services).

### Country detection (optional)

Whether the Google sign-in button is shown depends on the visitor's country. Detection uses the free [DB-IP Country Lite](https://db-ip.com/db/download/ip-to-country-lite) database (CC BY 4.0, attribution required wherever it is used). The file is not part of this repository: download `dbip-country-lite.mmdb` and put it at `backend/geoip/dbip-country-lite.mmdb`. Without it the app works and the country is simply treated as unknown.

## Tests

```bash
# backend: real PostgreSQL and a real local Ollama, no mocks
docker compose up -d backend-test
docker compose exec backend-test pytest

# frontend: runs in a Node container, Node is not needed on the host
frontend/fe.sh npm test
frontend/fe.sh npx tsc --noEmit
```

## Deployment
Production runs on a single server behind a reverse proxy. The deployment tooling is operational and is maintained privately, so it is not part of this repository. To run your own instance, build the images from `backend/` and `frontend/` and serve them behind the reverse proxy of your choice, using `docker-compose.yml` as a reference for services, volumes and environment.

## Documentation

- In the app: `/docs`
- Technical notes (in Russian): [backend/docs](backend/docs): access policy, event log and cleanup, laboratory snapshots, backups, LLM routing, entity statuses

## Releases

Versions follow [Semantic Versioning](https://semver.org/): a minor version is a new feature, a patch is a fix, and 1.0.0 will mark a fully finished product. `scripts/release.sh patch|minor|major` bumps the version, updates the changelog and tags the release.

## Support the project

Meridian is free software developed by one person. If it is useful to you, you can support its development:

- YooMoney: https://yoomoney.ru/to/4100118892485316
- CloudTips: https://pay.cloudtips.ru/p/d6f0acf8
- Bitcoin (BTC): `19uURkCzLR7XTd7LAReMTQrfEh8AA1d9zk`
- Ethereum (ETH): `0xd217E1591799C41Ca45F6496958d26dc3740b5f8`
- Litecoin (LTC): `LSyYMor5HHWtH52vFPJ8aPVdaEV74EJHf6`

## Security

Please report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## License

Copyright (C) 2026 Dinozavrikov. Licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified version as a network service, you must offer its source code to the users of that service.

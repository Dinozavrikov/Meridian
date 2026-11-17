# Meridian

[![License](https://img.shields.io/github/license/Dinozavrikov/Meridian?style=flat)](LICENSE) [![Version](https://img.shields.io/github/v/tag/Dinozavrikov/Meridian?label=version)](CHANGELOG.md) ![Status](https://img.shields.io/badge/status-in%20development-orange)

**Have an idea? Check it. Then show it to people.**

Meridian is a place to find out whether you are right. Write down what you notice, say what you expect to happen, and connect the dots. Later you see what actually came true. When you are ready, open a **laboratory**: a shared space where you and other people test the idea together, with evidence instead of arguments.

It works for small things (which pizza is really the best?) and for big ones (can a household cover its own food?).

Try it: [Meridian: check an idea, then show it to people](https://miridin.com) · [Русская версия ниже](#ru)

> [!WARNING]
> **Meridian is under active development (pre-1.0).** Many features are unfinished or may not work yet (for example, laboratories are not complete), and the data model, API and interface can change without notice. Use it for experiments, keep backups of anything important and do not treat it as production-ready. See the [changelog](CHANGELOG.md) for what is already there.

## What it does

- **Laboratories:** a shared space around one question. Invite people, give them roles, save snapshots of where you are, and see who predicts best.
- **Your thinking in one place:** observations, hypotheses, predictions, beliefs, questions and tasks, connected into a graph you can explore.
- **Honest-thinking tools:** ask "what would prove me wrong?", check whether your evidence is varied enough, separate facts from interpretations, and see how well your forecasts match reality.
- **Nothing gets lost:** every edit has a history with undo, deleted things wait in a trash you can restore from, and you can attach files.
- **Local AI:** translation, classification, embeddings and image description run on a local model through Ollama: on your own machine if you host Meridian yourself, and on the author's computer on the live site. No external AI service is used.
- **Privacy:** private messages are encrypted in the database, and backups are encrypted and regularly test-restored.

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

---

<a id="ru"></a>

# Meridian по-русски

**Есть идея? Проверьте ее. А потом покажите людям.**

Meridian: место, где можно выяснить, правы ли вы. Записывайте, что замечаете, говорите, чего ждете, и связывайте точки между собой. Потом смотрите, что из этого действительно сбылось. А когда захотите, откройте **лабораторию**: общее пространство, где вы вместе с другими проверяете идею, опираясь на факты, а не на споры.

Подойдет и для мелочей (какая пицца на самом деле лучше?), и для больших вопросов (может ли семья обеспечить себя едой?).

Попробовать: [Meridian: проверьте идею и покажите людям](https://miridin.com) · [English version above](#meridian)

> [!WARNING]
> **Meridian находится в активной разработке (версия до 1.0).** Многие возможности не доделаны или могут не работать (например, лаборатории еще не завершены), а модель данных, API и интерфейс могут меняться без предупреждения. Подходит для экспериментов; важные данные сохраняйте отдельно и не считайте продукт готовым к промышленной эксплуатации. Что уже есть, смотрите в [журнале изменений](CHANGELOG.md).

## Что умеет

- **Лаборатории:** общее пространство вокруг одного вопроса. Зовите людей, раздавайте роли, сохраняйте снимки того, где вы сейчас, и смотрите, кто точнее всех предсказывает.
- **Ваши мысли в одном месте:** наблюдения, гипотезы, прогнозы, убеждения, вопросы и задачи, связанные в граф, по которому можно ходить.
- **Инструменты честного мышления:** спросить себя «что докажет, что я неправ?», проверить, достаточно ли разнообразны ваши свидетельства, отделить факты от трактовок и увидеть, насколько ваши прогнозы совпадают с реальностью.
- **Ничего не пропадает:** у каждой правки есть история с откатом, удаленное лежит в корзине, откуда его можно вернуть, а к записям можно прикреплять файлы.
- **Локальный ИИ:** перевод, классификация, эмбеддинги и описание изображений работают на локальной модели через Ollama: на вашем компьютере, если вы развернули Meridian у себя, и на компьютере автора на живом сайте. Внешние ИИ-сервисы не используются.
- **Приватность:** личные сообщения шифруются в базе, а резервные копии шифруются и регулярно проверяются восстановлением.

Полный список изменений в [CHANGELOG.md](CHANGELOG.md).

## Стек

| Слой     | Технологии                                       |
|----------|--------------------------------------------------|
| Frontend | Next.js, React, TypeScript                       |
| Backend  | FastAPI (Python 3.12), SQLAlchemy, Alembic       |
| Данные   | PostgreSQL с pgvector, Redis                     |
| ИИ       | Ollama (локальные модели)                        |
| Инфра    | Docker Compose                            |

## Быстрый старт (локальная разработка)

Нужен Docker с Compose v2. Ollama необязателен (нужен только для ИИ-функций).

```bash
git clone https://github.com/Dinozavrikov/Meridian.git
cd Meridian
cp .env.example .env
cp docker-compose.override.example.yml docker-compose.override.yml
# сгенерировать секреты (те же команды лежат в начале .env.example)
sed -i "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -hex 32)|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^POSTGRES_TEST_PASSWORD=.*|POSTGRES_TEST_PASSWORD=$(openssl rand -hex 16)|" .env
sed -i "s|^MESSAGE_ENCRYPTION_KEY=.*|MESSAGE_ENCRYPTION_KEY=$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')|" .env
docker compose up -d --build postgres redis mailpit backend recheck-worker frontend
```

- Приложение: http://localhost:3000
- API: http://localhost:8000
- Mailpit (перехватывает исходящую почту): http://localhost:8025

Миграции базы выполняются сами при старте контейнера backend.

### ИИ-функции

Backend обращается к локальному Ollama по адресу `http://host.docker.internal:11434`. Имя модели по умолчанию `qwen2.5-custom`: это собственная модель, она не опубликована, поэтому укажите любую свою чат-модель через `OLLAMA_MODEL` (и при необходимости `OLLAMA_URL`) в `.env`. Выбор моделей по задачам описан в [backend/docs/LLM_ROUTING.md](backend/docs/LLM_ROUTING.md). Без Ollama приложение работает, но ИИ-функции недоступны.

### Вход через Google (необязательно)

Выключен, пока не заданы `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`. Тот, кто запускает публичный экземпляр, сам отвечает за соблюдение законов своей юрисдикции, в том числе ограничений на сторонние сервисы входа (например, российских правил об иностранных сервисах авторизации).

### Определение страны (необязательно)

От страны посетителя зависит, показывается ли кнопка входа через Google. Для этого используется бесплатная база [DB-IP Country Lite](https://db-ip.com/db/download/ip-to-country-lite) (CC BY 4.0, везде, где она применяется, нужна атрибуция). Сам файл в репозиторий не входит: скачайте `dbip-country-lite.mmdb` и положите в `backend/geoip/dbip-country-lite.mmdb`. Без него приложение работает, а страна считается неизвестной.

## Тесты

```bash
# backend: настоящий PostgreSQL и настоящий локальный Ollama, без моков
docker compose up -d backend-test
docker compose exec backend-test pytest

# frontend: запускается в контейнере Node, на хосте Node не нужен
frontend/fe.sh npm test
frontend/fe.sh npx tsc --noEmit
```

## Развертывание
Прод работает на одном сервере за обратным прокси. Инструменты развертывания относятся к эксплуатации и ведутся приватно, поэтому в этот репозиторий не входят. Чтобы запустить свой экземпляр, соберите образы из `backend/` и `frontend/` и поставьте их за выбранный вами обратный прокси; `docker-compose.yml` послужит образцом по сервисам, томам и переменным окружения.

## Документация

- В приложении: `/docs`
- Технические заметки: [backend/docs](backend/docs): политика доступа, журнал событий и очистка, снимки лабораторий, резервные копии, маршрутизация моделей, статусы записей

## Релизы

Версии по [семантическому версионированию](https://semver.org/lang/ru/): минорная версия это новая функция, патч это исправление, 1.0.0 будет означать полностью готовый продукт. `scripts/release.sh patch|minor|major` поднимает версию, обновляет журнал изменений и ставит тег.

## Поддержка проекта

Meridian это свободное программное обеспечение, которое разрабатывает один человек. Если он вам полезен, вы можете поддержать разработку:

- ЮMoney: https://yoomoney.ru/to/4100118892485316
- CloudTips: https://pay.cloudtips.ru/p/d6f0acf8
- Bitcoin (BTC): `19uURkCzLR7XTd7LAReMTQrfEh8AA1d9zk`
- Ethereum (ETH): `0xd217E1591799C41Ca45F6496958d26dc3740b5f8`
- Litecoin (LTC): `LSyYMor5HHWtH52vFPJ8aPVdaEV74EJHf6`

## Безопасность

О найденных уязвимостях сообщайте приватно, см. [SECURITY.md](SECURITY.md).

## Лицензия

Copyright (C) 2026 Dinozavrikov. Лицензия [GNU Affero General Public License v3.0](LICENSE). Если вы запускаете измененную версию как сетевой сервис, вы обязаны предоставить ее исходный код пользователям этого сервиса.

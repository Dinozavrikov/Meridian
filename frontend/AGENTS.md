<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Окружение разработки

На dev-машине **нет node/npm** — все команды фронтенда (установка пакетов, tsc, eslint,
тесты, сборка) запускаются через `./fe.sh` (контейнер того же node-образа, что и в
`Dockerfile`): `./fe.sh npm test`, `./fe.sh npx tsc --noEmit`, `./fe.sh npm install <пакет>`.
Прод-образ собирается локально отдельным скриптом выкладки (хранится вне репозитория). Все тексты UI — через
`useT` (ключи в `lib/i18n/strings.ts`, русская база; другие языки переводятся на бэкенде).

## Переводы интерфейса (как это устроено)

Русская база — `lib/i18n/strings.ts`; другие языки переводит локальная модель на бэкенде
(`/api/v1/i18n/ensure/{locale}`), результат кэшируется в БД и в `localStorage`
(ключи `i18n-cache:v3:*` с отпечатком русского оригинала и `dyn-i18n-cache:v2:*`, см. `lib/i18n/cache-keys.ts`).

- Модель отвечает по очереди, поэтому пачки (30 ключей) грузятся ПОСЛЕДОВАТЕЛЬНО
  (`lib/i18n/chunked-loader.ts`); nginx на проде обрывает запрос через 60 с.
- Строки, которые сервер не смог перевести, приходят в поле `missing`; русский оригинал НИКОГДА не
  выдаётся за перевод и не кэшируется — иначе строка навсегда остаётся русской в браузере.
- Новый язык прогревают заранее: `cat allkeys.json | env PYTHONPATH=/app python3 scripts/warm_i18n.py <locale>` в контейнере backend.
- При смене формата кэша меняйте версию в `cache-keys.ts` (`v2` → `v3`): старые данные отбросятся сами.

Статусы и другие тексты, которые задаёт система (приходят с API по-русски), переводятся
динамическим каналом `useDynamicTranslate` (текст как ключ), а не ключами `t()` — см. `StatusBadge`.
В диаграммах подпись переводится, а цвет берётся по исходному статусу (`lib/stats-chart.ts`).
Страница, переведённая целиком, добавляется в `lib/i18n/migrated-pages.test.ts`: тест не даёт вернуть
в неё русские литералы вне словаря.

## Показ HTML, проверки перед деплоем, история правок

- Пользовательский HTML (text/description/body) показывается ТОЛЬКО через `renderableHtml()` / `sanitizeHtml()`
  (`lib/render-safe-html.ts`, `lib/sanitize-html.ts`, DOMPurify): через API в эти поля можно записать что угодно,
  а показ идёт и чужим людям. Новый `dangerouslySetInnerHTML` в обход них роняет `lib/html-sinks.test.ts`.
  Текст без разметки из HTML достаётся через `stripHtml()` (DOMParser, инертный разбор), не через `innerHTML`.
- Скрипт выкладки (хранится вне репозитория) перед rsync и сборкой запускает `../scripts/check-frontend.sh` (tsc + vitest): красные
  проверки останавливают деплой. Аварийный обход: `SKIP_CHECKS=1` у скрипта выкладки.
- Вкладка «История» (`components/entities/entity-history-tab.tsx`) доступна только владельцу записи. Значения
  пользовательских шкал попадают в журнал событий под ключом `scale:<id>`, а события, порождённые откатом,
  помечены `reverts_event_id` (формат — `backend/docs/EVENT_LOG_AND_CLEANUP.md`).

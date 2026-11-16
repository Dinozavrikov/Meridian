# Event log: cascade-cleanup полиморфных дочерних таблиц (PR A, 22.09)

## Проблема

6 базовых сущностей (`ENTITY_MODELS` в `entity_registry.py`) имеют дочерние
таблицы, связанные полиморфно через `entity_type`/`entity_id` — без реального
FK на родителя, потому что типов-родителей несколько (Observation, Hypothesis,
Prediction, Worldview, Question, ResearchTask). Без FK нет и `ON DELETE
CASCADE` — при hard delete родителя дочерние строки становились сиротами.

Найденный при аудите факт: `EntityTag` не чистился вообще для `prediction`/
`task` (только для 4 из 6 типов, вручную, в самих delete-роутах). Остальные
6 полиморфных таблиц (`EntityComment`, `UserCommentSeen`, `EntityImage`,
`EntityAttachment`, `SourceDocument`, `EntityEmbedding`) не чистились вообще
ни для одного из 6 типов. `Link` (from/to, не entity_type/entity_id) —
отдельный случай, тоже не чистился ни с одной из двух сторон.

## Решение — единый реестр + одна точка cascade-cleanup

`app/core/entity_registry.py::POLYMORPHIC_CHILD_MODELS` — реестр всех
полиморфных дочерних моделей, по тому же принципу, что `ENTITY_MODELS`/
`EVENT_LOGGED_MODELS`. Добавление новой такой таблицы в будущем (например
`EntityStage`, PR B) — одна строка в этом словаре, не правка кода listener'а.

`app/services/event_log.py::_capture_event_log` (`before_flush`) — в ветке
`tracked_deleted`, для каждого удаляемого объекта, чей тип входит в
`ENTITY_MODELS`: bulk-`DELETE` по каждой модели из `POLYMORPHIC_CHILD_MODELS`
(`WHERE entity_type=... AND entity_id=obj.id`), плюс отдельная ветка на `Link`
(обе стороны: `from_type/from_id` И `to_type/to_id` — `Link` не входит в
реестр из-за другой формы ключа).

Почему в `before_flush`, а не отдельным сервисным вызовом в каждом роуте:
тот же аргумент, что и у остального event-log — забыть добавить чистку в
новый delete-роут физически невозможно, раз она не зависит от роута вообще.

## Файлы на диске — GC (закрыт 22.09, был осознанным техдолгом)

`EntityImage` (filename/thumb_filename) и `EntityAttachment` (storage_path)
хранят реальные файлы на диске. DB-cleanup выше не трогает файлы — нужен
отдельный механизм, и наивный `os.remove()` прямо в `before_flush` был бы
багом: `before_flush` выполняется ДО коммита, если транзакция потом
откатится — файл будет стёрт, а строка в БД останется (хуже исходного
сиротства: раньше хотя бы была валидная ссылка).

Решение — collect-then-execute-after-commit:
- в `before_flush`, до bulk-DELETE дочерних строк (после DELETE путь уже не
  достать), пути резолвятся через `image_processing.py::resolve_image_path`
  и `attachment_storage.py::resolve_attachment_path` и складываются в
  `session.info["_pending_file_cleanup"]`;
- `event_log.py::_cleanup_pending_files` (`after_commit`) — физический
  `os.remove()` по собранным путям, только когда транзакция гарантированно
  закоммичена;
- `event_log.py::_clear_pending_files_on_rollback` (`after_rollback`) —
  обязательная очистка того же списка при откате: `session.info` живёт на
  сессию, не на транзакцию, без этого списка путей, собранный до отката,
  пережил бы rollback и был бы ошибочно применён к следующему, никак не
  связанному, `commit()` на той же сессии.

Мягко удалённые (`EntityAttachment.deleted_at` задан) вложения тоже
физически чистятся при удалении родителя — решение Алексея 22.09: раз
родителя больше нет, различие soft/hard для самого вложения теряет смысл.
Обычный soft-delete вложения (родитель жив) по-прежнему не трогает файл —
это отдельная, всё ещё не реализованная GC-задача (см. докстринг
`EntityAttachment` в `models/entities.py`), не смешивать с этим PR.

`IMAGES_DIR`/`resolve_image_path` живут в `services/image_processing.py`
(раньше `IMAGES_DIR` дублировался как локальная константа в
`api/v1/images.py`) — симметрично `attachment_storage.py`, чтобы
`event_log.py` мог импортировать путь из сервисного слоя, а не из роутера
(обратная зависимость роутер→сервис недопустима).

## Тесты

- `tests/test_polymorphic_cleanup.py` — все 7 таблиц реестра + обе стороны
  `Link` чистятся при удалении Observation; регресс на исходный баг отдельно
  для Prediction и Task (EntityTag); проверка, что чистка бьёт по
  `entity_id`, не только по `entity_type` (не трогает чужие сущности того
  же типа).
- `tests/test_polymorphic_cleanup_files.py` — реальная запись байт на диск
  и проверка `os.path.exists()` до/после для EntityImage и EntityAttachment,
  включая soft-deleted вложение; отдельный тест на rollback — файл должен
  пережить откат И не быть ошибочно удалён при следующем, не связанном,
  commit (проверка `after_rollback`).
- `tests/test_embedding_guard.py::ALLOWED_TABLE_ACCESS` — расширен на
  `core/entity_registry.py`: реестр держит `EntityEmbedding` только как
  значение в словаре для generic-DELETE, колонки `embedding`/
  `embedding_model` не читает и не сравнивает — инвариант "не путать
  векторы разных моделей" не задевается.

## Не входит в объём

Одноразовый прод-cleanup осиротевших `EntityTag`-строк (`LEFT JOIN ... WHERE
id IS NULL`) — не выполнялся: на момент PR A прод не имеет реальных
пользователей (проверочный запрос вернул 0 строк). Вернуться к этому перед
первым релизом с реальными данными.

## События updated: формат meta (история и откат правок)

- `meta.changed_fields = {поле: {"old": ..., "new": ...}}` — колонки пишет before_flush-листенер.
- Значения шкал (таблица `scale_values`, это не сущность) пишет явно
  `services/scale_values.py::set_scale_value`; ключ — `"scale:<scale_id>"` (префикс вне имён колонок).
- `meta.reverts_event_id` — событие порождено откатом указанного события (`event_log._updated_meta`
  для колонок, `set_scale_value` для шкал). Обычные правки его не содержат; события до 03.10.2026
  не помечены. На вердикт `evaluate_undo` не влияет, нужен интерфейсу истории.
- `undone` — отдельное событие-маркер отката (`meta.reverted_event_id`), в ленту не попадает.

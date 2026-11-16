# Статусы сущностей: единые справочники

Статус сущности — не свободная строка, а значение из одного справочника. Список живёт в одном месте на бэкенде,
зеркалится одним файлом на фронте, а расхождение между ними ловит тест. Копировать список литералом нельзя: так
в `quick-add` наблюдений появились «требует уточнения» и «устарело», которых не знал ни степпер созревания, ни бэкенд.

| Сущность | Источник правды (бэкенд) | Вход (схема) | Зеркало на фронте | Тесты |
|---|---|---|---|---|
| Наблюдение | `Literal ObservationStatus` в `schemas/entities.py` | `ObsCreate.status` | `lib/observation-constants.ts` | `observation-constants.test.ts`, `tests/test_observation_status_validation.py` |
| Прогноз | `core/prediction_status.py` (`OPEN_PREDICTION_STATUS`, `CLOSED_PREDICTION_STATUSES`, `PREDICTION_STATUSES`) | `PredCreate.status` (`Literal PredictionStatus`) | `lib/prediction-status.ts` | `prediction-status.test.ts`, `tests/test_prediction_input_validation.py`, `tests/test_prediction_open_status_single_source.py` |
| Гипотеза | `core/hypothesis_status.py` (`HYPOTHESIS_STATUSES` и три группы для статистики профиля) | `HypCreate.status` (`Literal HypothesisStatus`) | `lib/hypothesis-constants.ts` | `hypothesis-constants.test.ts`, `tests/test_hypothesis_status_validation.py` |
| Вопрос, убеждение, задача | — | — | `STATUSES` внутри страниц | **не переведены**: статус пока свободная строка (отложено владельцем) |

Дефолты в `models/entities.py` и `schemas/entities.py` держат литерал (импорт `app.core` из моделей и схем на циклы
не проверялся) — их равенство константе стерегут тесты. Остальной код бэкенда литерал «не проверен» использовать
не должен (`test_no_new_copies_of_the_literal_in_app_code`, проверка по AST).

## Как добавить или изменить статус
1. Бэкенд: константа (для прогноза и гипотезы — в `core/*_status.py`) и `Literal` в `schemas/entities.py`.
2. Фронт: зеркало в `lib/*-constants.ts` (или `prediction-status.ts`), цвет — в `lib/theme.ts` и `lib/utils.ts`.
3. Тесты синхронности зелёные; если статус уходит в статистику (группы в `api/v1/users.py`) — он должен попасть ровно в
   одну группу (`test_groups_partition_all_statuses_without_overlap`).
4. Перед введением нового `Literal` для сущности, у которой его ещё нет, проверить данные на проде: недопустимый
   статус в уже сохранённых записях сломает их правку (PUT вернёт 422), и нужна миграция.

## Прогнозы: уверенность и закрытие
- `confidence` — целое 0..100 (`Confidence` в `schemas/entities.py`); `NULL` допустим, но такой прогноз **не попадает
  в калибровку** (`calibration_source.py` отбирает `confidence IS NOT NULL`). Форма всегда спрашивает уверенность, поэтому
  `NULL` остаётся у старых записей, репостов и стартовых прогнозов регистрации.
- Закрыть прогноз можно только через `PUT /predictions/{id}/close`. Через общий `PUT` смена исхода запрещена, и
  `confidence` закрытого прогноза менять нельзя. Причины: закрытие вносит вклад в сигнал гипотезы
  (`process_prediction_close`: `evidence_signal` копится прибавлением и не вычитается — повторное закрытие или
  переоткрытие рассинхронизировали бы его), а калибровка читает уверенность живьём, и правка задним числом позволила бы
  «улучшить» её, зная исход. Сама калибровка считается на лету и больше не копится.

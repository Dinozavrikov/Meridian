// Единый источник правды для встроенных шкал.
// Используется страницей /scales и детальными страницами сущностей (гипотезы и т.п.)

export interface ScaleLevel {
  value: number
  label: string
  desc: string
}

export interface Scale {
  id: string
  name: string
  entity_type: string
  min: number
  max: number
  step: number
  group_by: string
  color: string
  builtin: boolean
  description: string
  levels: ScaleLevel[]
}

export const DEFAULT_SCALES: Scale[] = [
  {
    id: "maturity", name: "Зрелость", entity_type: "hypothesis",
    min: 0, max: 4, step: 1, group_by: "status", color: "#7C70F5", builtin: true,
    description: "Показывает насколько гипотеза проверена и обоснована",
    levels: [
      { value: 0, label: "Интуиция",                desc: "Доказательств пока нет" },
      { value: 1, label: "Первые наблюдения",        desc: "Появились первые данные в пользу идеи" },
      { value: 2, label: "Первичные подтверждения",  desc: "Данные в пользу идеи накопились" },
      { value: 3, label: "Многократно подтверждена", desc: "Подтверждений набрано много" },
      { value: 4, label: "Опорная",                  desc: "Подтверждений больше всего: на идею можно опираться" },
    ],
  },
  {
    id: "stability", name: "Стабильность", entity_type: "hypothesis",
    min: 0, max: 10, step: 1, group_by: "none", color: "#00CFAA", builtin: true,
    description: "Насколько гипотеза устойчива к опровержению",
    levels: [
      { value: 0,  label: "Нестабильна",     desc: "Легко опровергается" },
      { value: 3,  label: "Слабая",          desc: "Есть серьёзные контраргументы" },
      { value: 5,  label: "Средняя",         desc: "Баланс подтверждений и сомнений" },
      { value: 7,  label: "Устойчивая",      desc: "Редкие опровержения" },
      { value: 10, label: "Очень устойчива", desc: "Практически не опровергается" },
    ],
  },
  {
    id: "research_load", name: "Нагрузка исследования", entity_type: "hypothesis",
    min: 0, max: 10, step: 1, group_by: "none", color: "#F59D3A", builtin: true,
    description: "Сколько усилий требует дальнейшая проверка",
    levels: [
      { value: 0,  label: "Без усилий",    desc: "Проверяется автоматически" },
      { value: 3,  label: "Лёгкая",        desc: "Несколько наблюдений" },
      { value: 5,  label: "Средняя",       desc: "Требует планирования" },
      { value: 7,  label: "Тяжёлая",       desc: "Нужен эксперимент" },
      { value: 10, label: "Очень тяжёлая", desc: "Требует значительных ресурсов" },
    ],
  },
  {
    id: "risk", name: "Риск", entity_type: "hypothesis",
    min: 0, max: 10, step: 1, group_by: "none", color: "#E0524C", builtin: true,
    description: "Насколько велик риск ошибиться, действуя на основе этой гипотезы",
    levels: [
      { value: 0,  label: "Безопасно",       desc: "Ошибка ничего не стоит" },
      { value: 3,  label: "Низкий риск",     desc: "Последствия легко обратимы" },
      { value: 5,  label: "Умеренный риск",  desc: "Заметные, но не критичные потери" },
      { value: 7,  label: "Высокий риск",    desc: "Серьёзные последствия" },
      { value: 10, label: "Критический риск", desc: "Потенциально непоправимые потери" },
    ],
  },
  {
    id: "confidence", name: "Уверенность", entity_type: "worldview",
    min: 1, max: 5, step: 1, group_by: "none", color: "#7C70F5", builtin: true,
    description: "Насколько вы уверены в этом убеждении",
    levels: [
      { value: 1, label: "Сомнение",      desc: "Скорее неверно" },
      { value: 2, label: "Неуверенность", desc: "Больше вопросов чем ответов" },
      { value: 3, label: "Нейтрально",    desc: "Равновесие аргументов" },
      { value: 4, label: "Уверен",        desc: "Есть весомые основания" },
      { value: 5, label: "Убеждён",       desc: "Многократно проверено" },
    ],
  },
  {
    id: "importance", name: "Значимость", entity_type: "observation",
    min: 0, max: 5, step: 1, group_by: "status", color: "#1ABC9C", builtin: true,
    description: "Насколько важно это наблюдение для дальнейших выводов",
    levels: [
      { value: 0, label: "Незначительное",  desc: "Случайная деталь" },
      { value: 1, label: "Любопытное",      desc: "Стоит запомнить" },
      { value: 2, label: "Заметное",        desc: "Может повлиять на гипотезы" },
      { value: 3, label: "Важное",          desc: "Меняет картину исследования" },
      { value: 4, label: "Очень важное",    desc: "Существенно двигает исследование" },
      { value: 5, label: "Ключевое",        desc: "Определяет направление работы" },
    ],
  },
  {
    id: "importance", name: "Важность", entity_type: "question",
    min: 0, max: 5, step: 1, group_by: "status", color: "#F5A623", builtin: true,
    description: "Насколько важно получить ответ на этот вопрос",
    levels: [
      { value: 0, label: "Праздный",     desc: "Интересно, но не критично" },
      { value: 1, label: "Полезный",     desc: "Прояснит детали" },
      { value: 2, label: "Значимый",     desc: "Влияет на решения" },
      { value: 3, label: "Важный",       desc: "Блокирует прогресс без ответа" },
      { value: 4, label: "Очень важный", desc: "Существенно влияет на план" },
      { value: 5, label: "Критический",  desc: "От ответа зависит весь план" },
    ],
  },
  {
    id: "progress", name: "Прогресс", entity_type: "task",
    min: 0, max: 100, step: 5, group_by: "none", color: "#4A90D9", builtin: true,
    description: "Насколько выполнена исследовательская задача",
    levels: [
      { value: 0,   label: "Не начата",      desc: "Работа ещё не велась" },
      { value: 25,  label: "В начале пути",  desc: "Первые шаги сделаны" },
      { value: 50,  label: "На середине",    desc: "Половина работы позади" },
      { value: 75,  label: "Почти готово",   desc: "Остались детали" },
      { value: 100, label: "Завершена",      desc: "Задача полностью выполнена" },
    ],
  },
  {
    id: "confidence", name: "Уверенность", entity_type: "prediction",
    min: 0, max: 100, step: 5, group_by: "none", color: "#4dcfa6", builtin: true,
    description: "Насколько вы уверены в исходе прогноза",
    levels: [
      { value: 0,   label: "Скорее нет",  desc: "Больше сомнений, чем уверенности" },
      { value: 50,  label: "50/50",       desc: "Равновероятно" },
      { value: 100, label: "Почти уверен", desc: "Высокая субъективная уверенность" },
    ],
  },
]

/**
 * Применяет перевод к builtin-шкале (name/description/levels).
 * НЕ трогает кастомные пользовательские шкалы (builtin=false) — их
 * текст задаёт сам пользователь, машинный перевод к нему не применяется.
 */
export function translateScale<T extends Scale>(scale: T, dt: (s: string) => string): T {
  if (!scale.builtin) return scale
  return {
    ...scale,
    name: dt(scale.name),
    description: dt(scale.description),
    levels: scale.levels.map(l => ({ ...l, label: dt(l.label), desc: dt(l.desc) })),
  }
}

/** Можно ли вернуть шкалу в «не оценено». Встроенные — только там, где бэкенд хранит NULL
 *  (значимость наблюдений и важность вопросов); пользовательские лежат строкой в scale_values
 *  и снимаются записью null. */
export function isClearableScale(scale: Pick<Scale, "id" | "builtin" | "entity_type">): boolean {
  if (!scale.builtin) return true
  return scale.id === "importance" && (scale.entity_type === "observation" || scale.entity_type === "question")
}

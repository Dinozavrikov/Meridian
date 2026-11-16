// frontend/lib/observation-constants.ts
//
// Единственный источник правды по стадиям зрелости наблюдения. Раньше список
// был скопирован в observations/page.tsx, maturation-stepper.tsx и
// search-modal.tsx, а quick-add-observation-modal держал четвёртый,
// расходящийся список ("требует уточнения", "устарело") — такие записи
// не попадали ни на одну ступень степпера.
export const OBSERVATION_STATUSES: string[] = ["сырое", "осмысленное", "интегрированное", "архивное"]
export const DEFAULT_OBSERVATION_STATUS = "осмысленное"

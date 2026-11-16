// frontend/lib/ownership.ts
//
// Единая проверка владения сущностью для UI (показывать ли кнопки
// редактирования/удаления, и — отдельно — не переводить ли свой же
// контент, см. lib/i18n/use-translated-query.ts). Бэкенд и без этого уже
// фильтрует PUT/DELETE по user_id на уровне API — это фикс только для
// того, чтобы не рендерить заведомо нерабочие кнопки на чужих (публичных/
// лабораторных) сущностях.
//
// ownerField обобщает поле владельца: у большинства сущностей это
// user_id, но, например, у Lab — owner_id (лаба может иметь участников
// с user_id, отличным от владельца, так что "мой user_id есть в записи"
// само по себе не значит "я владелец"). Дефолт оставлен "user_id" —
// это не ломает ни один из существующих вызовов isOwner(user, entity)
// без третьего аргумента.
export function isOwner(
  user: { id: number } | null | undefined,
  entity: Record<string, any> | null | undefined,
  ownerField: string = "user_id"
): boolean {
  return !!user && !!entity && user.id === entity[ownerField]
}

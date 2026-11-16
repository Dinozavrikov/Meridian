export interface PieDatum {
  name: string
  value: number
  color: string
}

/** Данные круговой диаграммы «сущности по статусам». Подпись переводится (статусы задаёт система и
 * переводятся динамическим каналом, см. StatusBadge), а цвет берётся по ИСХОДНОМУ русскому статусу:
 * карта цветов ключуется исходными названиями. */
export function buildPieData(
  byStatus: Record<string, number> | undefined,
  translate: (status: string) => string,
  colors: Record<string, string>,
  fallbackColor = "#555",
): PieDatum[] {
  return Object.entries(byStatus ?? {}).map(([status, value]) => ({
    name: translate(status),
    value,
    color: colors[status] ?? fallbackColor,
  }))
}

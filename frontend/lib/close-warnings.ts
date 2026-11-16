/** Мягкие подсказки в окне закрытия прогноза (ничего не запрещают). Только по структуре полей, текст пояснения
 *  не анализируется, кроме «пусто или нет». Поле, которое не передали (undefined), предупреждений не вызывает. */
export interface CloseWarnInput {
  status: string | null
  notes: string
  confidence?: number | null
  confirms_hypothesis_if_true?: boolean
  hypothesis_id?: number | null
}

export function closeWarnings(i: CloseWarnInput): string[] {
  if (!i.status) return []
  const out: string[] = []
  // стресс-тест: «если сбудется, гипотеза неверна» — для сигнала смысл исхода обратный
  if (i.confirms_hypothesis_if_true === false && i.hypothesis_id) {
    out.push(i.status === "не подтвердился" ? "closeWarn.stress.up" : "closeWarn.stress.down")
  }
  if (!i.notes.trim()) out.push("closeWarn.noNotes")
  // в сигнал вклад идёт как при 50%, а калибровка берёт только прогнозы с уверенностью
  if (i.confidence === null) out.push("closeWarn.noConfidence")
  return out
}

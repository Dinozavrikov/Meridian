// frontend/lib/partial-create.ts
//
// Создание записи — несколько запросов: сама запись, а потом то, что можно создать только с её id
// (связи, галерея, inline-картинки из редактора). Если запись создана, а поздний шаг упал, мутация
// НЕ должна завершаться ошибкой: форма осталась бы открытой, и повторное «Сохранить» создало бы
// дубль. Поэтому поздние шаги изолированы: ошибка одного не мешает остальным, а список
// провалившихся возвращается вызывающему (см. use-partial-create-notice.ts).
export type PostCreateStep = "links" | "images" | "inline" | "attach"

export async function runPostCreateSteps(
  steps: Array<[PostCreateStep, () => Promise<unknown>]>,
): Promise<PostCreateStep[]> {
  const failed: PostCreateStep[] = []
  for (const [name, run] of steps) {
    try { await run() } catch { failed.push(name) }
  }
  return failed
}

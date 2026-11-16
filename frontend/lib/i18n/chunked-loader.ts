export type Dict = Record<string, string>

export interface EnsureReply {
  translations: Dict
  /** Ключи, которые сервер не смог перевести (сбой модели). Их нет в translations. */
  missing?: string[]
}

export interface ChunkedLoadOptions {
  strings: Dict
  post: (chunk: Dict) => Promise<EnsureReply>
  chunkSize?: number
  concurrency?: number
  retries?: number
  retryDelayMs?: number
  /** Вызывается после каждого чанка с накопленным словарём. */
  onChunk?: (merged: Dict) => void
  /** Если вернёт true — новые запросы больше не отправляются (смена языка, размонтирование). */
  shouldStop?: () => boolean
}

/** Убирает то, что не является переводом: пустые значения и русский оригинал, выданный
 * за перевод. `source` — словарь оригиналов (для ключей, которых в нём нет, проверка
 * на совпадение не делается). */
export function dropUntranslated(dict: Dict, source: Dict): Dict {
  const out: Dict = {}
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== "string" || value.trim() === "") continue
    if (key in source && value === source[key]) continue
    out[key] = value
  }
  return out
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Грузит переводы пачками. Локальная модель отвечает по очереди, поэтому по умолчанию
 * пачки идут ПОСЛЕДОВАТЕЛЬНО (concurrency = 1): параллельные запросы раньше стояли в
 * очереди и падали по таймауту (nginx на проде обрывает запрос через 60 с).
 * Ключи, которые сервер вернул в missing, и запросы, упавшие по сети, повторяются.
 * Никогда не бросает исключение: упавшая пачка не мешает остальным.
 */
export async function loadTranslationsChunked(opts: ChunkedLoadOptions): Promise<Dict> {
  const {
    strings, post, chunkSize = 30, concurrency = 1, retries = 2, retryDelayMs = 1500, onChunk, shouldStop,
  } = opts
  const entries = Object.entries(strings)
  const chunks: Dict[] = []
  for (let i = 0; i < entries.length; i += chunkSize) {
    chunks.push(Object.fromEntries(entries.slice(i, i + chunkSize)))
  }

  let merged: Dict = {}
  let next = 0

  async function processChunk(chunk: Dict) {
    let pending = chunk
    for (let attempt = 0; attempt <= retries && Object.keys(pending).length > 0; attempt++) {
      if (shouldStop?.()) return
      if (attempt > 0) await sleep(retryDelayMs * attempt)
      try {
        const reply = await post(pending)
        const accepted = dropUntranslated(reply.translations ?? {}, strings)
        if (Object.keys(accepted).length > 0) {
          merged = { ...merged, ...accepted }
          onChunk?.(merged)
        }
        const missing = new Set(reply.missing ?? [])
        pending = Object.fromEntries(Object.entries(pending).filter(([key]) => missing.has(key)))
      } catch (err) {
        console.warn("Пачка перевода не удалась:", err)
      }
    }
    if (Object.keys(pending).length > 0) {
      console.warn(`Не удалось перевести ${Object.keys(pending).length} строк, повторим при следующей загрузке`)
    }
  }

  async function worker() {
    while (next < chunks.length) {
      if (shouldStop?.()) return
      await processChunk(chunks[next++])
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))
  return merged
}

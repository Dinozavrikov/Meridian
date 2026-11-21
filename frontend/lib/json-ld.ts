/** Сериализация данных для <script type="application/ld+json">. Единственное место, где данные
 *  превращаются в содержимое script: экранирует <, >, & и разделители строк, чтобы текст записи
 *  не мог закрыть тег или оборвать строку. Охранный тест html-sinks.test.ts пропускает только ее. */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

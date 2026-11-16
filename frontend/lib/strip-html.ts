// Разбор через DOMParser, а не innerHTML у элемента живого документа: у <img src=x onerror=...>
// загрузка и обработчик срабатывают даже у элемента, не вставленного в DOM. DOMParser отдаёт
// инертный документ (без браузинг-контекста): ресурсы не грузятся, обработчики не вызываются.
export function stripHtml(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]+>/g, "")
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
}

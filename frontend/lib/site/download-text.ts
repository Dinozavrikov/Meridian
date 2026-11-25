/** Отдает текст браузеру как файл. Файл собирается в памяти страницы, ничего никуда не отправляется. */
export function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Адрес освобождается чуть позже: часть браузеров читает его уже после click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

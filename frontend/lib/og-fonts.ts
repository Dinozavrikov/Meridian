import { readFile } from "node:fs/promises"
import { join } from "node:path"

const FILES = ["pt-serif-cyrillic-700-normal.woff", "pt-serif-latin-700-normal.woff"] as const

/** Шрифты картинки записи. Читаются с диска: fetch по file:// в Node-окружении Next не работает
 *  ("not implemented... yet"), и картинка отвечала 500. Кириллица и латиница лежат в разных файлах. */
export async function ogFonts() {
  const [cyrillic, latin] = await Promise.all(FILES.map(f => readFile(join(process.cwd(), "assets", "fonts", f))))
  return [
    { name: "PT Serif", data: cyrillic, weight: 700 as const, style: "normal" as const },
    { name: "PT Serif", data: latin, weight: 700 as const, style: "normal" as const },
  ]
}

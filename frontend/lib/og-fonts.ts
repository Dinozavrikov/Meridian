import { readFile } from "node:fs/promises"
import { join } from "node:path"

// У каждого файла свое имя семейства: при общем имени отрисовщик брал знаки только из первого файла,
// а за остальными шел в сеть (без сети вместо них рисовались квадраты).
const FACES = [
  { name: "PT Serif", file: "pt-serif-cyrillic-700-normal.woff" },
  { name: "PT Serif Latin", file: "pt-serif-latin-700-normal.woff" },
] as const

/** Значение fontFamily для картинок: перечисляет все файлы. */
export const OG_FONT_FAMILY = FACES.map(f => `"${f.name}"`).join(", ")

/** Шрифты картинки записи. Читаются с диска: fetch по file:// в Node-окружении Next не работает
 *  ("not implemented... yet"), и картинка отвечала 500. Кириллица и латиница лежат в разных файлах. */
export async function ogFonts() {
  return Promise.all(FACES.map(async f => ({
    name: f.name as string,
    data: await readFile(join(process.cwd(), "assets", "fonts", f.file)),
    weight: 700 as const,
    style: "normal" as const,
  })))
}

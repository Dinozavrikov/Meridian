// Журналы контейнеров без ограничения съедают диск (nginx набрал 182 МБ), а политика обещает ограниченный срок хранения.
// Поэтому у каждого сервиса compose должна быть ротация. Реальный эффект проверяется на сервере: docker inspect ... LogConfig.
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const text = readFileSync(join(process.cwd(), "..", "docker-compose.yml"), "utf-8")
const block = text.split(/^services:[ \t]*$/m)[1].split(/^[^\s#]/m)[0]
const services = block.split(/^  (?=[a-z0-9_-]+:[ \t]*$)/m).slice(1)

describe("docker-compose: ротация журналов", () => {
  it("находит сервисы", () => {
    expect(services.length).toBeGreaterThanOrEqual(8)
  })
  it("у каждого сервиса подключено ограничение журнала", () => {
    const without = services.map(s => s.split(":")[0]).filter((_, i) => !/^ {4}logging:/m.test(services[i]))
    expect(without).toEqual([])
  })
  it("ограничение задает размер и число файлов", () => {
    expect(text).toMatch(/max-size:\s*"?\d+[mk]"?/)
    expect(text).toMatch(/max-file:\s*"?\d+"?/)
  })
})

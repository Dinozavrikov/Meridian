// Реквизиты поддержки: совпадают с FUNDING.yml и README, а адреса настоящие (контрольная сумма, формат).
import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { CARD_METHODS, CRYPTO } from "@/lib/support"
import { GUEST_ALLOWED, isGuestAllowedPath } from "@/lib/guest-access"

const ROOT = resolve(process.cwd(), "..")
const funding = readFileSync(resolve(ROOT, ".github/FUNDING.yml"), "utf-8")
const readme = readFileSync(resolve(ROOT, "README.md"), "utf-8")
const addr = (id: string) => CRYPTO.find(c => c.id === id)!.address

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
function base58check(a: string): { ok: boolean; version: number } {
  let n = BigInt(0)
  for (const c of a) {
    const i = ALPHABET.indexOf(c)
    if (i < 0) return { ok: false, version: -1 }
    n = n * BigInt(58) + BigInt(i)
  }
  const hex = n.toString(16)
  if (hex.length > 50) return { ok: false, version: -1 }
  const bytes = Buffer.from(hex.padStart(50, "0"), "hex")
  const sha = (b: Buffer) => createHash("sha256").update(b).digest()
  const sum = sha(sha(bytes.subarray(0, 21))).subarray(0, 4)
  return { ok: sum.equals(bytes.subarray(21)), version: bytes[0] }
}

describe("реквизиты поддержки", () => {
  it("ссылки на оплату в FUNDING.yml те же, что в коде", () => {
    const urls = (funding.match(/https?:\/\/\S+/g) ?? []).sort()
    expect(urls).toEqual(CARD_METHODS.map(m => m.url).sort())
  })
  it("README содержит все ссылки и адреса из кода", () => {
    for (const m of CARD_METHODS) expect(readme, m.url).toContain(m.url)
    for (const c of CRYPTO) expect(readme, c.symbol).toContain(c.address)
  })
  it("BTC: контрольная сумма base58check верна, тип P2PKH", () => {
    expect(base58check(addr("btc"))).toEqual({ ok: true, version: 0 })
  })
  it("LTC: контрольная сумма base58check верна, тип P2PKH", () => {
    expect(base58check(addr("ltc"))).toEqual({ ok: true, version: 48 })
  })
  it("проверка контрольной суммы реально ловит опечатку", () => {
    const a = addr("btc")
    const typo = a.slice(0, -1) + (a.endsWith("k") ? "m" : "k")
    expect(base58check(typo).ok).toBe(false)
  })
  it("ETH: 0x и 40 шестнадцатеричных символов", () => {
    expect(addr("eth")).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
  it("страница доступна гостю", () => {
    expect(GUEST_ALLOWED).toContain("/support")
    expect(isGuestAllowedPath("/support")).toBe(true)
  })
})

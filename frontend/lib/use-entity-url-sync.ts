"use client"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

export function useEntityUrlSync<T extends { id: number; slug?: string }>(
  data: T[],
  selected: T | null,
  setSelected: (item: T | null) => void,
  fetchById?: (idOrSlug: string) => Promise<T>,
  isMobile?: boolean,
  getAutoSelectData?: () => T[]
) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (data.length > 0 && !selected) {
      const idParam = searchParams.get("id")
      if (!idParam) {
        if (!isMobile) {
          const autoSelectData = getAutoSelectData ? getAutoSelectData() : data
          setSelected(autoSelectData[0] ?? null)
        }
        return
      }
      const found = data.find((item) => item.slug === idParam || String(item.id) === idParam)
      if (found) {
        setSelected(found)
        return
      }
      if (isMobile) {
        return
      }
      if (fetchById) {
        fetchById(idParam)
          .then((item) => setSelected(item))
          .catch(() => setNotFound(true))
      } else {
        const autoSelectData = getAutoSelectData ? getAutoSelectData() : data
        setSelected(autoSelectData[0] ?? null)
      }
    }
  }, [data, isMobile, getAutoSelectData])

  useEffect(() => {
    if (selected && data.length > 0) {
      const fresh = data.find((item) => item.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [data])
  // Смена ?id= клиентской навигацией (например Link из очереди проверки на
  // ту же страницу) НЕ ремонтит компонент, а первый эффект выше срабатывает
  // только на [data, isMobile, getAutoSelectData] и гвардится !selected —
  // после авто-выбора первого элемента на исходной загрузке этот гвард
  // больше никогда не пропускает, поэтому URL менялся (router.replace
  // отрабатывал), а selected — нет. Баг-репорт Алексея 18.08: клик
  // "Открыть" в PredictionQueue не открывал элемент. Отдельный эффект,
  // реагирующий именно на id-параметр, не завязан на !selected.
  useEffect(() => {
    const idParam = searchParams.get("id")
    if (!idParam) return
    if (selected && (selected.slug === idParam || String(selected.id) === idParam)) return
    const found = data.find((item) => item.slug === idParam || String(item.id) === idParam)
    if (found) {
      setSelected(found)
    } else if (fetchById) {
      fetchById(idParam).then((item) => setSelected(item)).catch(() => setNotFound(true))
    }
  }, [searchParams.toString()])

  const selectEntity = (item: T, extraParams?: Record<string, string>) => {
    setSelected(item)
    const p = new URLSearchParams(searchParams.toString())
    p.set("id", item.slug || String(item.id))
    p.set("tab", "detail")
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) p.set(k, v)
    }
    router.replace(`?${p.toString()}`)
  }

  const clearSelection = () => {
    setSelected(null)
    const p = new URLSearchParams(searchParams.toString())
    p.delete("id")
    router.replace(`?${p.toString()}`)
  }

  return { selectEntity, notFound, clearSelection }
}

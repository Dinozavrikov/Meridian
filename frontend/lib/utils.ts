import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STATUS_COLORS: Record<string, string> = {
  "открыт":                  "#4A90D9",
  "исследуется":             "#F5A623",
  "отвечен":                 "#27AE60",
  "отложен":                 "#404040",
  "отклонён":                "#E74C3C",
  "открыта":                 "#4A90D9",
  "приостановлена":          "#F5A623",
  "решена":                  "#27AE60",
  "закрыта":                 "#3a3a3a",
  "идея":                    "#363636",
  "активная проверка":       "#4A90D9",
  "ожидание данных":         "#F5A623",
  "заморожена":              "#404040",
  "отвергнута":              "#E74C3C",
  "частично подтверждена":   "#2ECC71",
  "подтверждается":          "#27AE60",
  "подтвердилось":            "#27AE60",
  "требует пересмотра":      "#9B59B6",
  "не проверен":             "#363636",
  "подтвердился":            "#27AE60",
  "частично подтвердился":   "#2ECC71",
  "не подтвердился":         "#E74C3C",
  "гипотеза":                "#8a8a8a",
  "частично подтверждается": "#2ECC71",
  "пересматривается":        "#F5A623",
  "отвергнуто":              "#E74C3C",
}

export const TYPE_COLORS: Record<string, string> = {
  hypothesis:  "#4A90D9",
  observation: "#2ECC71",
  prediction:  "#F5A623",
  worldview:   "#9B59B6",
  question:    "#1ABC9C",
  task:        "#E84393",
  lab:         "#4dcfa6",
}

export const TYPE_RU: Record<string, string> = {
  hypothesis:  "Гипотеза",
  observation: "Наблюдение",
  prediction:  "Прогноз",
  worldview:   "Убеждение",
  question:    "Вопрос",
  task:        "Задача",
  lab:         "Лаборатория",
}

export const ACCENT = "#4A90D9"

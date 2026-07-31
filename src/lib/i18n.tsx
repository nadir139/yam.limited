import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { en } from '@/locales/en'
import { it } from '@/locales/it'
import { fr } from '@/locales/fr'
import { es } from '@/locales/es'
import { de } from '@/locales/de'

// Language, without a framework.
//
// i18next and friends bring a plugin system, a resource loader and a
// backend — none of which this needs. What it needs is a flat dictionary per
// language, a lookup that falls back to English, and interpolation. That is
// roughly forty lines, and it stays legible, which matters more here than
// feature surface.
//
// English is the fallback rather than the key. A missing Italian string shows
// the English sentence, not `project.emptyTitle` — a half-translated app should
// look unfinished, never broken.

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export type Dictionary = Record<string, string>

const DICTIONARIES: Record<LanguageCode, Dictionary> = { en, it, fr, es, de }

const STORAGE_KEY = 'yam.language'

/** The browser's preference, if it is one we speak. */
function detect(): LanguageCode {
  const stored = localStorage.getItem(STORAGE_KEY) as LanguageCode | null
  if (stored && stored in DICTIONARIES) return stored
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.split('-')[0] as LanguageCode
    if (base in DICTIONARIES) return base
  }
  return 'en'
}

type Vars = Record<string, string | number>

/** `{count}` style placeholders, because `%s` says nothing about what it holds. */
function interpolate(template: string, vars?: Vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  )
}

interface I18nValue {
  lang: LanguageCode
  setLang: (code: LanguageCode) => void
  t: (key: string, vars?: Vars) => string
}

const I18nContext = createContext<I18nValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => en[key] ?? key,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>('en')

  // Read on mount rather than in useState's initialiser: this module is
  // imported by the marketing bundle too, and touching localStorage or
  // navigator during module evaluation breaks server-side rendering and any
  // environment where they are absent.
  useEffect(() => {
    setLangState(detect())
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<I18nValue>(() => {
    const dict = DICTIONARIES[lang] ?? en
    return {
      lang,
      setLang: (code) => {
        localStorage.setItem(STORAGE_KEY, code)
        setLangState(code)
      },
      t: (key, vars) => interpolate(dict[key] ?? en[key] ?? key, vars),
    }
  }, [lang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useTranslation = () => useContext(I18nContext)

const DIVISIONS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Infinity],
]

/**
 * "7 days ago", "fra 2 ore" — in whatever language is selected.
 *
 * Intl.RelativeTimeFormat is built into the platform and already knows every
 * locale's rules for this, which a hand-rolled "n days ago" would get wrong the
 * moment it left English.
 */
export function useRelativeTime() {
  const { lang } = useTranslation()
  return (iso: string | null | undefined): string => {
    if (!iso) return ''
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
    let delta = (new Date(iso).getTime() - Date.now()) / 1000
    for (const [unit, span] of DIVISIONS) {
      if (Math.abs(delta) < span) return rtf.format(Math.round(delta), unit)
      delta /= span
    }
    return rtf.format(Math.round(delta), 'year')
  }
}

/**
 * How long someone took to turn up, as a plain duration rather than "ago".
 *
 * Null when either end is missing — an invitation never accepted has no
 * duration, and saying "0 days" would read as though they arrived instantly.
 */
export function useDuration() {
  const { lang } = useTranslation()
  return (fromIso: string | null, toIso: string | null): string | null => {
    if (!fromIso || !toIso) return null
    const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
    if (ms < 0) return null
    const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 })
    const mins = ms / 60000
    if (mins < 60) return `${fmt.format(Math.max(1, Math.round(mins)))} min`
    const hours = mins / 60
    if (hours < 48) return `${fmt.format(Math.round(hours))} h`
    return `${fmt.format(Math.round(hours / 24))} d`
  }
}

/**
 * How complete each language is, measured rather than claimed.
 *
 * Used by the language menu to mark a partial translation, so nobody picks
 * German expecting the whole app and quietly gets half of it.
 */
export function translationCoverage(code: LanguageCode): number {
  const total = Object.keys(en).length
  if (total === 0) return 1
  const dict = DICTIONARIES[code] ?? {}
  const done = Object.keys(en).filter((k) => Boolean(dict[k])).length
  return done / total
}

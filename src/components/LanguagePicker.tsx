import { Languages, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LANGUAGES, translationCoverage, useTranslation } from '@/lib/i18n'

// The language menu marks anything under-translated rather than presenting
// every language as equally finished. Coverage is measured against the English
// dictionary at render time, so it cannot drift from what actually shipped.

export default function LanguagePicker() {
  const { lang, setLang, t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('common.language')}>
          <Languages size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal">
          {t('common.language')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((l) => {
          const coverage = translationCoverage(l.code)
          return (
            <DropdownMenuItem key={l.code} onClick={() => setLang(l.code)} className="gap-2">
              <span className="flex-1">{l.label}</span>
              {coverage < 0.95 && (
                <span className="text-[10px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {Math.round(coverage * 100)}%
                </span>
              )}
              {l.code === lang && <Check size={14} />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

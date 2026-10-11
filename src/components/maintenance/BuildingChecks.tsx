import { useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { useProjectId } from '@/contexts/ProjectContext'
import * as db from '@/lib/db'
import { BUILDING_CHECKS, everyLabel } from '@/lib/building-checks'

// The usual maintenance of a building, offered once on an empty building
// (migration 044). Each ticked check becomes an ordinary service interval on
// a part, created under its system if missing; nothing is hidden or special
// about them afterwards. Typical practice, not a country's rules.

const muted = { color: 'hsl(var(--muted-foreground))' }

export function BuildingChecks() {
  const projectId = useProjectId()
  const qc = useQueryClient()
  const [chosen, setChosen] = useState(() => new Set(BUILDING_CHECKS.map((_, k) => k)))
  const [busy, setBusy] = useState(false)
  const [lastDone, setLastDone] = useState('')

  const add = async () => {
    setBusy(true)
    let added = 0
    try {
      // Sequential on purpose: each part is found or created before its
      // children, and create_part returns the existing part of that name.
      const ids = new Map<string, string>()
      const partId = async (name: string, category: string, parentId?: string) => {
        const key = `${parentId ?? ''}/${name}`
        if (!ids.has(key)) ids.set(key, (await db.createPart(projectId, { name, category, parentId: parentId ?? null })).part.id)
        return ids.get(key)!
      }
      for (const [k, c] of BUILDING_CHECKS.entries()) {
        if (!chosen.has(k)) continue
        const system = await partId(c.system.name, c.system.category)
        const part = await partId(c.part.name, c.part.category, system)
        await db.setServiceInterval(projectId, { partId: part, title: c.title, everyDays: c.everyDays, lastDoneOn: lastDone || null })
        added++
      }
      toast.success(`${added} checks added. Edit any of them on the part's Maintenance tab.`)
    } catch (e) {
      toast.error(`${added} added, then: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
      qc.invalidateQueries({ queryKey: ['maintenance', projectId] })
      qc.invalidateQueries({ queryKey: ['parts'] })
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        Start with the usual checks of a building. Tick what applies; each becomes an interval you can change later. They are common
        practice: check your installer's instructions and local rules.
      </p>
      <ul className="flex flex-col gap-1">
        {BUILDING_CHECKS.map((c, k) => (
          <li key={k}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosen.has(k)}
                onChange={(e) =>
                  setChosen((s) => {
                    const n = new Set(s)
                    if (e.target.checked) n.add(k)
                    else n.delete(k)
                    return n
                  })
                }
              />
              <span>{c.title}</span>
              <span className="text-xs" style={muted}>
                · {c.part.name} · {everyLabel(c.everyDays)}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        Last done (optional, for all):
        <input type="date" className="h-8 rounded-md border bg-background px-2" value={lastDone} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setLastDone(e.target.value)} />
        <span style={muted}>Without a date each shows "never recorded" until its first service.</span>
      </label>
      <Button size="sm" className="self-start" disabled={busy || chosen.size === 0} onClick={add}>
        {busy ? 'Adding…' : `Add ${chosen.size} checks`}
      </Button>
    </div>
  )
}

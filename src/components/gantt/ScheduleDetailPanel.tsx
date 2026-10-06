import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ExternalLink, X } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fromDay, toDay, type ScheduleItem, type ScheduleResult } from '@/lib/schedule'
import { useLinkWorkPackages, useUnlinkWorkPackages } from '@/lib/query-hooks'
import type { WorkPackageDependency } from '@/lib/types'
import { plural, shortDate } from './scale'

// One work package in time: where it was planned, where it will land and why,
// what it waits on and what waits on it. Exact dates are typed here; the bars
// are for rough moves.

const selectStyle = {
  borderColor: 'hsl(var(--border))',
  background: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'bad' | 'warn' }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-b-0" style={{ borderColor: 'hsl(var(--border))' }}>
      <span style={{ color: 'hsl(var(--muted-foreground))' }}>{label}</span>
      <span
        className="text-right font-medium"
        style={{ color: tone === 'bad' ? 'hsl(0 72% 51%)' : tone === 'warn' ? 'hsl(38 90% 45%)' : undefined }}
      >
        {value}
      </span>
    </div>
  )
}

export default function ScheduleDetailPanel({
  item,
  schedule,
  dependencies,
  canReschedule,
  canLink,
  onClose,
  onReschedule,
  onOpen,
}: {
  item: ScheduleItem | null
  schedule: ScheduleResult
  dependencies: WorkPackageDependency[]
  canReschedule: boolean
  canLink: boolean
  onClose: () => void
  onReschedule: (id: string, start: number, end: number, reason?: string) => void
  onOpen: (id: string) => void
}) {
  const link = useLinkWorkPackages()
  const unlink = useUnlinkWorkPackages()

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [newPred, setNewPred] = useState('')
  const [kind, setKind] = useState<'FS' | 'SS'>('FS')
  const [lag, setLag] = useState('0')

  useEffect(() => {
    setStart(item?.plannedStart != null ? fromDay(item.plannedStart) : '')
    setEnd(item?.plannedEnd != null ? fromDay(item.plannedEnd) : '')
    setReason('')
    setNewPred('')
    setKind('FS')
    setLag('0')
  }, [item?.id, item?.plannedStart, item?.plannedEnd])

  if (!item) return <Sheet open={false} onOpenChange={() => onClose()} />

  const predecessors = dependencies.filter((d) => d.successor_id === item.id)
  const successors = dependencies.filter((d) => d.predecessor_id === item.id)
  const candidates = schedule.items.filter(
    (i) => i.id !== item.id && !predecessors.some((d) => d.predecessor_id === i.id),
  )

  const describeDep = (d: WorkPackageDependency, otherId: string) => {
    const other = schedule.byId[otherId]
    const lagText = d.lag_days ? ` ${d.lag_days > 0 ? '+' : ''}${d.lag_days}d` : ''
    return `${other?.wpNumber ?? '?'} · ${d.kind === 'SS' ? 'start together' : 'finish → start'}${lagText}`
  }

  const saveDates = () => {
    const s = toDay(start)
    const e = toDay(end || start)
    if (s === null || e === null) {
      toast.error('Enter a start date')
      return
    }
    if (e < s) {
      toast.error('The end cannot be before the start')
      return
    }
    onReschedule(item.id, s, e, reason.trim() || 'Dates edited on the schedule')
  }

  const addPredecessor = () => {
    if (!newPred) return
    const lagDays = Number(lag) || 0
    link.mutate(
      { predecessorId: newPred, successorId: item.id, kind, lagDays },
      {
        onSuccess: () => {
          toast.success(`${item.wpNumber} now waits on ${schedule.byId[newPred].wpNumber}`)
          setNewPred('')
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not link'),
      },
    )
  }

  const remove = (d: WorkPackageDependency) => {
    const r = window.prompt('Why is this dependency no longer true? (kept in the record)')
    if (r === null) return
    unlink.mutate(
      { predecessorId: d.predecessor_id, successorId: d.successor_id, reason: r },
      { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not remove') },
    )
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-sm" style={{ color: 'hsl(var(--accent))' }}>
              {item.wpNumber}
            </span>
            <span className="truncate">{item.title}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-5">
          <section>
            <Row label="Status" value={item.status.replace(/_/g, ' ')} />
            <Row label="Discipline" value={item.discipline.replace(/_/g, ' ')} />
            <Row label="Planned" value={item.scheduled ? `${shortDate(item.plannedStart)} → ${shortDate(item.plannedEnd)}` : 'Not scheduled'} />
            <Row
              label="Forecast"
              value={item.forecastStart !== null ? `${shortDate(item.forecastStart)} → ${shortDate(item.forecastEnd)}` : '—'}
              tone={item.slipDays !== null && item.slipDays > 0 ? 'bad' : undefined}
            />
            {item.baselineEnd !== null && (
              <Row label="Baseline" value={`${shortDate(item.baselineStart)} → ${shortDate(item.baselineEnd)}`} />
            )}
            {item.slipDays !== null && item.slipDays !== 0 && (
              <Row
                label="Slip"
                value={item.slipDays > 0 ? `+${plural(item.slipDays, 'day')}` : `${plural(-item.slipDays, 'day')} early`}
                tone={item.slipDays > 0 ? 'bad' : undefined}
              />
            )}
            {item.floatDays !== null && (
              <Row
                label="Float"
                value={item.critical ? 'None — on the critical path' : plural(item.floatDays, 'day')}
                tone={item.critical ? 'warn' : undefined}
              />
            )}
            {item.drivenBy && (
              <Row
                label="Pushed by"
                value={item.drivenBy === 'not started' ? 'Planned start passed, not started' : item.drivenBy}
                tone="warn"
              />
            )}
            {item.delayDays > 0 && (
              <Row label="Change orders" value={`+${plural(item.delayDays, 'day')} · ${item.delaySources.join(', ')}`} tone="bad" />
            )}
            {item.awaitingApproval && <Row label="Owner decision" value="Pending" tone="warn" />}
            {item.overdue && <Row label="Overdue" value="Past its end, not complete" tone="bad" />}
          </section>

          {canReschedule && !item.complete && (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Dates</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sd-start" className="text-xs">Planned start</Label>
                  <Input id="sd-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="sd-end" className="text-xs">Planned end</Label>
                  <Input id="sd-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              <Input placeholder="Reason (kept in the history)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button size="sm" onClick={saveDates} className="self-start">
                Save dates
              </Button>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Waits on</h3>
            {predecessors.length === 0 && (
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Nothing.</p>
            )}
            {predecessors.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{describeDep(d, d.predecessor_id)}</span>
                {canLink && (
                  <button type="button" onClick={() => remove(d)} aria-label="Remove dependency" className="opacity-60 hover:opacity-100">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {canLink && candidates.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select value={newPred} onChange={(e) => setNewPred(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border px-2 text-xs" style={selectStyle}>
                  <option value="">Add a package it waits on…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.wpNumber} · {c.title}
                    </option>
                  ))}
                </select>
                <select value={kind} onChange={(e) => setKind(e.target.value as 'FS' | 'SS')} className="h-8 rounded-md border px-2 text-xs" style={selectStyle}>
                  <option value="FS">after it finishes</option>
                  <option value="SS">starting with it</option>
                </select>
                <Input value={lag} onChange={(e) => setLag(e.target.value)} className="h-8 w-16 text-xs" inputMode="numeric" aria-label="Lag days" title="Lag in days" />
                <Button size="sm" variant="outline" onClick={addPredecessor} disabled={!newPred || link.isPending}>
                  Add
                </Button>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Waiting on this</h3>
            {successors.length === 0 && (
              <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>Nothing.</p>
            )}
            {successors.map((d) => (
              <div key={d.id} className="text-sm">
                {describeDep(d, d.successor_id)}
              </div>
            ))}
          </section>

          <Button variant="outline" size="sm" className="self-start" onClick={() => onOpen(item.id)}>
            <ExternalLink size={13} className="mr-1.5" /> Open work package
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

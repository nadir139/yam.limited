import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useMaintenanceRecord, useParts, usePermissions, useServiceDue, useVoidServiceRecord } from '@/lib/query-hooks'
import type { Part, ServiceRecord } from '@/lib/types'
import { toast } from 'sonner'
import { DueList, IntervalForm, ReadingForm, ReadingsList, ServiceForm, ServiceHistory } from './MaintenancePanels'

const muted = { color: 'hsl(var(--muted-foreground))' }

/**
 * One part's maintenance: its intervals and what they need, its readings,
 * and work done on it outside any interval. Shown on the Parts page for
 * every project on the vessel, refit or logbook.
 */
export default function PartMaintenancePanel({ part }: { part: Part }) {
  const { can } = usePermissions()
  const { data: due = [], isLoading } = useServiceDue()
  const { data: record } = useMaintenanceRecord()
  const { data: parts = [] } = useParts()
  const voidService = useVoidServiceRecord()
  const [form, setForm] = useState<'none' | 'reading' | 'interval' | 'other'>('none')
  const rows = due.filter((r) => r.part_id === part.id)
  const readings = (record?.readings ?? []).filter((r) => r.part_id === part.id)
  const other = (record?.services ?? []).filter((s) => s.part_id === part.id && !s.interval_id)
  const hoursNow = rows.find((r) => r.hours_now != null)?.hours_now ?? null
  const live = !part.removed_at

  const doVoid = (s: ServiceRecord) => {
    const reason = window.prompt('Why strike this service out? It stays readable, crossed through.')
    if (!reason?.trim()) return
    voidService.mutate({ id: s.id, reason: reason.trim() }, { onError: (e) => toast.error(e.message) })
  }
  const toggle = (f: typeof form) => setForm((cur) => (cur === f ? 'none' : f))

  return (
    <div className="flex flex-col gap-4">
      {live && (
        <div className="flex flex-wrap gap-1">
          {can('action_record_reading') && (
            <Button size="sm" variant={form === 'reading' ? 'default' : 'outline'} onClick={() => toggle('reading')}>
              Record a reading
            </Button>
          )}
          {can('action_set_service_interval') && (
            <Button size="sm" variant={form === 'interval' ? 'default' : 'outline'} onClick={() => toggle('interval')}>
              Add a service interval
            </Button>
          )}
          {can('action_record_service') && (
            <Button size="sm" variant={form === 'other' ? 'default' : 'outline'} onClick={() => toggle('other')}>
              Record other work done
            </Button>
          )}
        </div>
      )}
      {form === 'reading' && <ReadingForm parts={parts} partId={part.id} onDone={() => setForm('none')} />}
      {form === 'interval' && <IntervalForm parts={parts} partId={part.id} onDone={() => setForm('none')} />}
      {form === 'other' && <ServiceForm partId={part.id} hoursNow={hoursNow} onDone={() => setForm('none')} />}

      <section>
        <h3 className="mb-1 text-sm font-semibold">Service intervals</h3>
        {isLoading ? <p className="text-sm" style={muted}>Loading…</p> : <DueList rows={rows} record={record} parts={parts} showPart={false} />}
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold">Readings</h3>
        <ReadingsList readings={readings} parts={parts} />
      </section>
      {other.length > 0 && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Other work done</h3>
          <ServiceHistory services={other} onVoid={can('action_record_service') ? doVoid : undefined} />
        </section>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMaintenanceRecord, useParts, usePermissions, useProject, useServiceDue } from '@/lib/query-hooks'
import { STATUS_META } from '@/lib/maintenance'
import type { ServiceStatus } from '@/lib/types'
import { DueList, IntervalForm, ReadingForm, ReadingsList, StatusDot } from '@/components/maintenance/MaintenancePanels'
import { BuildingChecks } from '@/components/maintenance/BuildingChecks'

// Maintenance (migration 036; buildings 044): every service interval on the asset and
// what it needs next, worst first. The engineer records the hours on the
// meter here (or in the log), and what is due moves with them. The same
// record is on each part's Maintenance tab and colours the 3D view.

const muted = { color: 'hsl(var(--muted-foreground))' }
const COUNTED: ServiceStatus[] = ['OVERDUE', 'DUE_SOON', 'NO_BASELINE', 'NO_READING', 'OK']

export default function MaintenancePage() {
  const { data: project } = useProject()
  const { can } = usePermissions()
  const { data: due = [], isLoading } = useServiceDue()
  const { data: record } = useMaintenanceRecord()
  const { data: parts = [] } = useParts()
  const [form, setForm] = useState<'reading' | 'interval'>('reading')
  const counts = COUNTED.map((s) => ({ s, n: due.filter((r) => r.status === s).length })).filter((c) => c.n > 0)

  const isBuilding = project?.vessel?.asset_kind === 'BUILDING'

  if (project && !project.vessel_id) {
    return (
      <Card>
        <CardContent className="p-6 text-sm">
          Maintenance is kept on the asset (the boat or the building); this project has none recorded yet. Record it on the Project page.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Maintenance</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={muted}>
          <span>{project?.vessel?.name ?? ''}</span>
          {counts.map(({ s, n }) => (
            <span key={s} className="inline-flex items-center gap-1">
              <StatusDot status={s} /> {n} {STATUS_META[s].label.toLowerCase()}
            </span>
          ))}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <Card>
          <CardContent className="p-4">
            {isLoading ? (
              <p className="text-sm" style={muted}>Loading…</p>
            ) : due.length === 0 && isBuilding && can('action_set_service_interval') ? (
              <BuildingChecks />
            ) : due.length === 0 ? (
              <p className="text-sm">
                No service intervals yet. Set one up here or on a part's Maintenance tab in{' '}
                <Link to="/app/parts" className="underline">Parts</Link>: what it needs (oil and filter), how often
                (250 h or 12 months) and when it was last done.
              </p>
            ) : (
              <DueList rows={due} record={record} parts={parts} />
            )}
          </CardContent>
        </Card>

        {/* On a phone the forms come first: recording the hours is the job on deck. */}
        <div className="order-first flex flex-col gap-4 lg:order-none">
          {(can('action_record_reading') || can('action_set_service_interval')) && (
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex gap-1">
                  {can('action_record_reading') && (
                    <Button size="sm" variant={form === 'reading' ? 'default' : 'outline'} onClick={() => setForm('reading')}>
                      {isBuilding ? 'Record a reading' : 'Record hours'}
                    </Button>
                  )}
                  {can('action_set_service_interval') && (
                    <Button size="sm" variant={form === 'interval' ? 'default' : 'outline'} onClick={() => setForm('interval')}>
                      New interval
                    </Button>
                  )}
                </div>
                {form === 'reading' && can('action_record_reading') && <ReadingForm parts={parts} />}
                {form === 'interval' && can('action_set_service_interval') && <IntervalForm parts={parts} />}
              </CardContent>
            </Card>
          )}
          <Card className="hidden lg:block">
            <CardContent className="flex flex-col gap-2 p-4">
              <h3 className="text-sm font-semibold">Latest readings</h3>
              <ReadingsList readings={record?.readings ?? []} parts={parts} limit={15} />
            </CardContent>
          </Card>
        </div>
        {/* On a phone the readings follow what is due. */}
        <Card className="lg:hidden">
          <CardContent className="flex flex-col gap-2 p-4">
            <h3 className="text-sm font-semibold">Latest readings</h3>
            <ReadingsList readings={record?.readings ?? []} parts={parts} limit={15} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

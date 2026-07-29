import React, { useState } from 'react'
import { CalendarPlus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useScheduleInspection, useWorkPackages, usePermissions, type InspectionInput } from '@/lib/query-hooks'
import type { InspectionEvent } from '@/lib/types'

const ROLES: { value: InspectionEvent['inspector_role']; label: string }[] = [
  { value: 'CLASS_SURVEYOR', label: 'Class surveyor' },
  { value: 'OWNERS_REP', label: "Owner's rep" },
  { value: 'YARD_QC', label: 'Yard QC' },
  { value: 'FLAG_STATE', label: 'Flag state' },
]

const selectStyle = {
  borderColor: 'hsl(var(--border))',
  backgroundColor: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

const str = (v: string): string | null => (v.trim() === '' ? null : v)

export default function ScheduleInspectionForm({
  workPackageId,
  onSuccess,
}: {
  /** Pre-selects and hides the picker when opened from a work package. */
  workPackageId?: string
  onSuccess?: (insp: InspectionEvent) => void
}) {
  const empty: InspectionInput = {
    title: '',
    inspector_role: 'CLASS_SURVEYOR',
    work_package_id: workPackageId ?? null,
    inspector_name: null,
    scheduled_date: null,
    is_class_inspection: true,
    class_item_ref: null,
  }

  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<InspectionEvent | null>(null)
  const [form, setForm] = useState<InspectionInput>(empty)
  const { data: workPackages = [] } = useWorkPackages()
  const mutation = useScheduleInspection()
  const { can } = usePermissions()

  const set = <K extends keyof InspectionInput>(k: K, v: InspectionInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const handleClose = () => {
    setOpen(false)
    setCreated(null)
    mutation.reset()
    setForm(empty)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(form, {
      onSuccess: (insp) => {
        setCreated(insp)
        onSuccess?.(insp)
      },
    })
  }

  if (!can('action_schedule_inspection')) return null

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarPlus size={14} className="mr-1.5" />
        Schedule inspection
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {created ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 size={18} style={{ color: 'hsl(var(--success))' }} />
                  {created.inspection_number} scheduled
                </DialogTitle>
              </DialogHeader>
              <div
                className="rounded-md p-3 text-sm"
                style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
              >
                {created.title}
                {created.scheduled_date && ` — ${created.scheduled_date}`}
              </div>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                The result stays PENDING until someone records it. An attendance
                that has passed its date with no result is the gap the dashboard
                is meant to surface.
              </p>
              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Schedule inspection</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-3 py-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="insp-title">Title *</Label>
                  <Input
                    id="insp-title"
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder="Hull thickness survey — frames 40–50"
                    required
                  />
                </div>

                {!workPackageId && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="insp-wp">Work package</Label>
                    <select
                      id="insp-wp"
                      value={form.work_package_id ?? ''}
                      onChange={(e) => set('work_package_id', e.target.value || null)}
                      className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                      style={selectStyle}
                    >
                      <option value="">Not attached to a package</option>
                      {workPackages.map((wp) => (
                        <option key={wp.id} value={wp.id}>
                          {wp.wp_number} — {wp.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="insp-role">Inspector role *</Label>
                    <select
                      id="insp-role"
                      value={form.inspector_role}
                      onChange={(e) =>
                        set('inspector_role', e.target.value as InspectionEvent['inspector_role'])
                      }
                      className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                      style={selectStyle}
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="insp-name">Inspector name</Label>
                    <Input
                      id="insp-name"
                      value={form.inspector_name ?? ''}
                      onChange={(e) => set('inspector_name', str(e.target.value))}
                      placeholder="RINA Surveyor"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="insp-date">Scheduled date</Label>
                  <Input
                    id="insp-date"
                    type="date"
                    value={form.scheduled_date ?? ''}
                    onChange={(e) => set('scheduled_date', str(e.target.value))}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_class_inspection}
                    onChange={(e) => set('is_class_inspection', e.target.checked)}
                  />
                  Class attendance
                </label>

                {form.is_class_inspection && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="insp-classref">Class reference</Label>
                    <Input
                      id="insp-classref"
                      value={form.class_item_ref ?? ''}
                      onChange={(e) => set('class_item_ref', str(e.target.value))}
                      placeholder="RINA Pt.B Ch.2 Sec.1"
                    />
                  </div>
                )}

                {mutation.isError && (
                  <p className="text-sm" style={{ color: 'hsl(var(--destructive))' }}>
                    {mutation.error.message}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending || !form.title.trim()}>
                  {mutation.isPending ? 'Scheduling…' : 'Schedule'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

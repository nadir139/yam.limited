import React, { useState } from 'react'
import { Plus, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useCreateWorkPackage, type WorkPackageInput } from '@/lib/query-hooks'
import type { Discipline, WorkPackage } from '@/lib/types'

const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: 'STRUCTURAL', label: 'Structural' },
  { value: 'HULL', label: 'Hull' },
  { value: 'MECHANICAL', label: 'Mechanical' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'RIGGING', label: 'Rigging' },
  { value: 'INTERIOR', label: 'Interior' },
  { value: 'PAINT', label: 'Paint' },
  { value: 'CLASS', label: 'Class' },
  { value: 'SAFETY', label: 'Safety' },
]

const selectStyle = {
  borderColor: 'hsl(var(--border))',
  backgroundColor: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

const EMPTY: WorkPackageInput = {
  title: '',
  discipline: 'MECHANICAL',
  description: null,
  planned_hours: null,
  planned_cost: null,
  trade_contractor: null,
  planned_start: null,
  planned_end: null,
  is_class_item: false,
  class_item_ref: null,
}

/** Blank inputs must send null, not 0 — an unknown estimate is not a zero one. */
const num = (v: string): number | null => (v === '' ? null : Number(v))
const str = (v: string): string | null => (v.trim() === '' ? null : v)

export default function CreateWorkPackageForm({
  onSuccess,
}: {
  onSuccess?: (wp: WorkPackage) => void
}) {
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<WorkPackage | null>(null)
  const [form, setForm] = useState<WorkPackageInput>(EMPTY)
  const mutation = useCreateWorkPackage()

  const set = <K extends keyof WorkPackageInput>(k: K, v: WorkPackageInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const handleClose = () => {
    setOpen(false)
    setCreated(null)
    mutation.reset()
    setForm(EMPTY)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(form, {
      onSuccess: (wp) => {
        setCreated(wp)
        onSuccess?.(wp)
      },
    })
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} className="mr-1.5" />
        New work package
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {created ? (
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 size={18} style={{ color: 'hsl(var(--success))' }} />
                  {created.wp_number} created
                </DialogTitle>
              </DialogHeader>
              <div
                className="rounded-md p-3 text-sm"
                style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
              >
                {created.title}
              </div>
              <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                It starts in DRAFT. Move it to SCOPED once the scope is agreed —
                a proposed package and an agreed one are different things to a yard.
              </p>
              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>New work package</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-3 py-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wp-title">Title *</Label>
                  <Input
                    id="wp-title"
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder="Chiller relocation and deckhead mounting"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wp-disc">Discipline *</Label>
                    <select
                      id="wp-disc"
                      value={form.discipline}
                      onChange={(e) => set('discipline', e.target.value as Discipline)}
                      className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                      style={selectStyle}
                    >
                      {DISCIPLINES.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wp-contractor">Trade contractor</Label>
                    <Input
                      id="wp-contractor"
                      value={form.trade_contractor ?? ''}
                      onChange={(e) => set('trade_contractor', str(e.target.value))}
                      placeholder="Pendennis Mechanical"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wp-desc">Description</Label>
                  <Textarea
                    id="wp-desc"
                    value={form.description ?? ''}
                    onChange={(e) => set('description', str(e.target.value))}
                    rows={3}
                    placeholder="What the package covers, and what done looks like."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wp-hours">Planned hours</Label>
                    <Input
                      id="wp-hours"
                      type="number"
                      min={0}
                      value={form.planned_hours ?? ''}
                      onChange={(e) => set('planned_hours', num(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wp-cost">Planned cost (€)</Label>
                    <Input
                      id="wp-cost"
                      type="number"
                      min={0}
                      value={form.planned_cost ?? ''}
                      onChange={(e) => set('planned_cost', num(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wp-start">Planned start</Label>
                    <Input
                      id="wp-start"
                      type="date"
                      value={form.planned_start ?? ''}
                      onChange={(e) => set('planned_start', str(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wp-end">Planned end</Label>
                    <Input
                      id="wp-end"
                      type="date"
                      value={form.planned_end ?? ''}
                      onChange={(e) => set('planned_end', str(e.target.value))}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_class_item}
                    onChange={(e) => set('is_class_item', e.target.checked)}
                  />
                  Class item
                </label>

                {form.is_class_item && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wp-classref">Class reference</Label>
                    <Input
                      id="wp-classref"
                      value={form.class_item_ref ?? ''}
                      onChange={(e) => set('class_item_ref', str(e.target.value))}
                      placeholder="RINA Pt.C Ch.1 Sec.2"
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
                  {mutation.isPending ? 'Creating…' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

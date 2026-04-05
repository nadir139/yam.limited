import React, { useState } from 'react'
import { GitBranch, AlertTriangle, CheckCircle2, Plus } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { useCreateDefectWithCascade, type DefectFormInput, type CascadeResult } from '@/lib/query-hooks'
import type { DefectRecord } from '@/lib/types'

const SEVERITY_COLORS: Record<DefectRecord['severity'], string> = {
  LOW: 'hsl(var(--accent))',
  MEDIUM: 'hsl(45 93% 47%)',
  HIGH: 'hsl(38 92% 50%)',
  CRITICAL: 'hsl(var(--destructive))',
}

const eur = (n: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

interface Props {
  workPackageId?: string
  inspectionEventId?: string
  onSuccess?: (result: CascadeResult) => void
}

export default function RaiseDefectForm({ workPackageId, inspectionEventId, onSuccess }: Props) {
  const [open, setOpen] = useState(false)
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null)
  const [form, setForm] = useState<DefectFormInput>({
    title: '',
    description: '',
    location_on_vessel: '',
    severity: 'MEDIUM',
    root_cause: 'WEAR',
    disposition: 'PENDING',
    is_class_defect: false,
    class_item_ref: null,
    cost_impact: null,
    schedule_impact_days: null,
    work_package_id: workPackageId ?? null,
    inspection_event_id: inspectionEventId ?? null,
  })

  const mutation = useCreateDefectWithCascade()

  const set = <K extends keyof DefectFormInput>(k: K, v: DefectFormInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate(form, {
      onSuccess: (result) => {
        setCascadeResult(result)
        onSuccess?.(result)
      },
    })
  }

  const handleClose = () => {
    setOpen(false)
    setCascadeResult(null)
    mutation.reset()
    setForm({
      title: '',
      description: '',
      location_on_vessel: '',
      severity: 'MEDIUM',
      root_cause: 'WEAR',
      disposition: 'PENDING',
      is_class_defect: false,
      class_item_ref: null,
      cost_impact: null,
      schedule_impact_days: null,
      work_package_id: workPackageId ?? null,
      inspection_event_id: inspectionEventId ?? null,
    })
  }

  const willCascade =
    (form.severity === 'HIGH' || form.severity === 'CRITICAL') &&
    form.cost_impact != null &&
    form.cost_impact > 0

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        style={{ backgroundColor: 'hsl(var(--destructive))', color: 'white' }}
      >
        <Plus size={14} className="mr-1.5" />
        Raise NCR
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {cascadeResult ? (
            /* ─── Cascade result screen ─── */
            <div className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 size={18} style={{ color: 'hsl(var(--success))' }} />
                  NCR Raised — {cascadeResult.defect.ncr_number}
                </DialogTitle>
              </DialogHeader>

              <div
                className="rounded-md p-3 text-sm"
                style={{ backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}
              >
                {cascadeResult.defect.title}
              </div>

              {cascadeResult.changeOrder ? (
                <div>
                  <div
                    className="flex items-center gap-2 mb-3 text-sm font-semibold"
                    style={{ color: 'hsl(var(--primary))' }}
                  >
                    <GitBranch size={14} />
                    Cascade triggered — {cascadeResult.approval?.tier.replace('_', ' ')} approval required
                  </div>

                  {/* Cascade chain */}
                  <div className="flex flex-col gap-2">
                    {/* NCR */}
                    <div
                      className="flex items-center gap-3 rounded-md border p-3"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      <AlertTriangle size={14} style={{ color: SEVERITY_COLORS[cascadeResult.defect.severity] }} />
                      <div className="flex-1">
                        <span className="font-mono text-xs font-bold mr-2">{cascadeResult.defect.ncr_number}</span>
                        <span className="text-xs">{cascadeResult.defect.title}</span>
                      </div>
                      <Badge style={{ backgroundColor: SEVERITY_COLORS[cascadeResult.defect.severity] + '22', color: SEVERITY_COLORS[cascadeResult.defect.severity], border: 'none', fontSize: '10px' }}>
                        {cascadeResult.defect.severity}
                      </Badge>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center gap-2 pl-4">
                      <div className="w-px h-4" style={{ backgroundColor: 'hsl(var(--border))' }} />
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>auto-triggered</span>
                    </div>

                    {/* CO */}
                    <div
                      className="flex items-center gap-3 rounded-md border p-3"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(var(--primary))' }} />
                      <div className="flex-1">
                        <span className="font-mono text-xs font-bold mr-2">{cascadeResult.changeOrder.co_number}</span>
                        <span className="text-xs">{eur(cascadeResult.changeOrder.cost_delta)}</span>
                        {cascadeResult.changeOrder.schedule_delta_days > 0 && (
                          <span className="text-xs ml-2" style={{ color: 'hsl(var(--warning))' }}>
                            +{cascadeResult.changeOrder.schedule_delta_days}d
                          </span>
                        )}
                      </div>
                      <Badge style={{ backgroundColor: 'hsl(var(--primary)/0.1)', color: 'hsl(var(--primary))', border: 'none', fontSize: '10px' }}>
                        PENDING APPROVAL
                      </Badge>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center gap-2 pl-4">
                      <div className="w-px h-4" style={{ backgroundColor: 'hsl(var(--border))' }} />
                      <span className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>requires</span>
                    </div>

                    {/* Approval */}
                    {cascadeResult.approval && (
                      <div
                        className="flex items-center gap-3 rounded-md border p-3"
                        style={{ borderColor: 'hsl(38 92% 50%)', backgroundColor: 'hsl(38 92% 50% / 0.05)' }}
                      >
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'hsl(38 92% 50%)' }} />
                        <div className="flex-1">
                          <span className="font-mono text-xs font-bold mr-2">{cascadeResult.approval.approval_number}</span>
                          <span className="text-xs">Decision due by {cascadeResult.approval.deadline}</span>
                        </div>
                        <Badge style={{ backgroundColor: 'hsl(38 92% 50% / 0.15)', color: 'hsl(38 80% 38%)', border: 'none', fontSize: '10px' }}>
                          {cascadeResult.approval.tier.replace('_', ' ')}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  NCR recorded. No cascade triggered for {cascadeResult.defect.severity.toLowerCase()} severity without cost impact.
                </p>
              )}

              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            /* ─── Form screen ─── */
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>Raise Non-Conformance Report</DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4 mt-4">
                {/* Title */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="df-title">Title *</Label>
                  <Input
                    id="df-title"
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder="Short description of the defect"
                    required
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="df-desc">Description *</Label>
                  <Textarea
                    id="df-desc"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="Detailed description of the finding..."
                    rows={3}
                    required
                  />
                </div>

                {/* Location */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="df-loc">Location on Vessel *</Label>
                  <Input
                    id="df-loc"
                    value={form.location_on_vessel}
                    onChange={(e) => set('location_on_vessel', e.target.value)}
                    placeholder="e.g. Portside bilge, Frame 47–49"
                    required
                  />
                </div>

                {/* Severity + Root Cause row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="df-severity">Severity *</Label>
                    <select
                      id="df-severity"
                      value={form.severity}
                      onChange={(e) => set('severity', e.target.value as DefectRecord['severity'])}
                      className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="df-rc">Root Cause *</Label>
                    <select
                      id="df-rc"
                      value={form.root_cause}
                      onChange={(e) => set('root_cause', e.target.value as DefectRecord['root_cause'])}
                      className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                      style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                    >
                      <option value="WEAR">Wear</option>
                      <option value="CORROSION">Corrosion</option>
                      <option value="IMPACT">Impact</option>
                      <option value="FATIGUE">Fatigue</option>
                      <option value="INSTALLATION_ERROR">Installation Error</option>
                      <option value="DESIGN_DEFICIENCY">Design Deficiency</option>
                      <option value="MOISTURE_INGRESS">Moisture Ingress</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                {/* Disposition */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="df-disp">Disposition</Label>
                  <select
                    id="df-disp"
                    value={form.disposition}
                    onChange={(e) => set('disposition', e.target.value as DefectRecord['disposition'])}
                    className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm"
                    style={{ borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }}
                  >
                    <option value="PENDING">Pending assessment</option>
                    <option value="REPAIR">Repair</option>
                    <option value="REPLACE">Replace</option>
                    <option value="MONITOR">Monitor</option>
                    <option value="ACCEPT_AS_IS">Accept as-is</option>
                  </select>
                </div>

                {/* Cost + Schedule row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="df-cost">Cost Impact (€)</Label>
                    <Input
                      id="df-cost"
                      type="number"
                      min={0}
                      value={form.cost_impact ?? ''}
                      onChange={(e) => set('cost_impact', e.target.value ? Number(e.target.value) : null)}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="df-sched">Schedule Impact (days)</Label>
                    <Input
                      id="df-sched"
                      type="number"
                      min={0}
                      value={form.schedule_impact_days ?? ''}
                      onChange={(e) => set('schedule_impact_days', e.target.value ? Number(e.target.value) : null)}
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Class defect toggle */}
                <div className="flex items-center gap-3">
                  <input
                    id="df-class"
                    type="checkbox"
                    checked={form.is_class_defect}
                    onChange={(e) => set('is_class_defect', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <Label htmlFor="df-class" className="cursor-pointer">Class defect (requires surveyor sign-off)</Label>
                </div>

                {form.is_class_defect && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="df-classref">Class Item Reference</Label>
                    <Input
                      id="df-classref"
                      value={form.class_item_ref ?? ''}
                      onChange={(e) => set('class_item_ref', e.target.value || null)}
                      placeholder="e.g. RINA Pt.B Ch.3 Sec.6"
                    />
                  </div>
                )}

                {/* Cascade preview */}
                {willCascade && (
                  <div
                    className="flex items-start gap-2 rounded-md p-3 text-xs"
                    style={{ backgroundColor: 'hsl(38 92% 50% / 0.1)', color: 'hsl(38 80% 38%)' }}
                  >
                    <GitBranch size={13} className="mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold">Cascade will trigger: </span>
                      This NCR will automatically create a Change Order and Owner Approval request.
                    </div>
                  </div>
                )}

                {mutation.isError && (
                  <p className="text-xs" style={{ color: 'hsl(var(--destructive))' }}>
                    {(mutation.error as Error).message}
                  </p>
                )}
              </div>

              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  style={{ backgroundColor: 'hsl(var(--destructive))', color: 'white' }}
                >
                  {mutation.isPending ? 'Saving…' : 'Raise NCR'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NONE } from '@/lib/format'
import { useSetProjectAsset } from '@/lib/query-hooks'
import { ASSET_NOUN, DETAIL_FIELDS, type DetailField } from '@/lib/asset'
import type { Vessel } from '@/lib/types'

// The asset card for a building (and, later, an aircraft): the record that
// outlives every project done to it (migration 043). A boat keeps its own
// card and form (VesselDetailsForm), with LOA, beam, draft and class.

const muted = { color: 'hsl(var(--muted-foreground))' }
type Kind = 'BUILDING' | 'AIRCRAFT'

const TITLE: Record<Kind, string> = { BUILDING: 'The building', AIRCRAFT: 'The aircraft' }

function show(f: DetailField, v: unknown) {
  if (v === undefined || v === null || v === '') return NONE
  return f.unit ? `${v} ${f.unit}` : String(v)
}

export function AssetCard({ kind, asset, canEdit }: { kind: Kind; asset: Vessel | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const details = (asset?.details ?? {}) as Record<string, unknown>
  const fields = DETAIL_FIELDS[kind]
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{TITLE[kind]}</CardTitle>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {asset ? <Pencil size={13} className="mr-1.5" /> : <Plus size={13} className="mr-1.5" />}
            {asset ? 'Edit' : `Add the ${ASSET_NOUN[kind]}`}
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 text-sm">
        {asset ? (
          <>
            <div className="mb-4">
              <div className="text-2xl font-bold">{asset.name}</div>
              <div style={muted}>{[details.building_use ?? details.model, asset.year_built && `built ${asset.year_built}`].filter(Boolean).join(' · ') || NONE}</div>
            </div>
            {fields.map((f) => (
              <div key={f.key} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                <span style={muted}>{f.label}</span>
                <span className="text-right">{show(f, details[f.key])}</span>
              </div>
            ))}
          </>
        ) : (
          <p style={muted}>
            No {ASSET_NOUN[kind]} recorded yet. Record it once: its parts, maintenance and money then belong to the {ASSET_NOUN[kind]} and carry
            over to every project on it.
          </p>
        )}
      </CardContent>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{asset ? `Edit the ${ASSET_NOUN[kind]}` : `Add the ${ASSET_NOUN[kind]}`}</DialogTitle>
          </DialogHeader>
          {editing && <AssetForm kind={kind} asset={asset} onDone={() => setEditing(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function AssetForm({ kind, asset, onDone }: { kind: Kind; asset: Vessel | null; onDone: () => void }) {
  const save = useSetProjectAsset()
  const before = (asset?.details ?? {}) as Record<string, unknown>
  const [name, setName] = useState(asset?.name ?? '')
  const [year, setYear] = useState(asset?.year_built ? String(asset.year_built) : '')
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(DETAIL_FIELDS[kind].map((f) => [f.key, before[f.key] == null ? '' : String(before[f.key])])),
  )

  const submit = () => {
    // Send only what changed; a cleared field goes as "" so the server removes it.
    const details: Record<string, string | number | null> = {}
    for (const f of DETAIL_FIELDS[kind]) {
      const now = values[f.key].trim()
      const was = before[f.key] == null ? '' : String(before[f.key])
      if (now === was) continue
      if (now === '') details[f.key] = ''
      else if (f.type === 'number') {
        const n = Number(now.replace(',', '.'))
        if (!Number.isFinite(n)) {
          toast.error(`${f.label} must be a number`)
          return
        }
        details[f.key] = n
      } else details[f.key] = now
    }
    const y = year.trim() ? Number(year) : null
    save.mutate(
      { name: name.trim() || null, yearBuilt: y, details },
      {
        onSuccess: (r) => {
          const moved = r.moved && Object.values(r.moved).some((n) => n > 0)
          toast.success(moved ? `Recorded. What the project held on its own (${r.moved!.parts} parts) now belongs to the ${ASSET_NOUN[kind]}.` : 'Saved')
          onDone()
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="asset-name">Name</Label>
          <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'BUILDING' ? 'Villa Le Rose' : 'I-ABCD'} />
        </div>
        <div>
          <Label htmlFor="asset-year">Year built</Label>
          <Input id="asset-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} />
        </div>
        {DETAIL_FIELDS[kind].map((f) => (
          <div key={f.key} className={f.key === 'address' || f.key === 'cadastral_ref' ? 'col-span-2' : ''}>
            <Label htmlFor={`asset-${f.key}`}>
              {f.label}
              {f.unit ? ` (${f.unit})` : ''}
            </Label>
            <Input
              id={`asset-${f.key}`}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              placeholder={f.placeholder}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={save.isPending || (!asset && name.trim().length === 0)} onClick={submit}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  )
}

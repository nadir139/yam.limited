import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FlipHorizontal2, Loader2, RotateCw, Save, Trash2, Upload, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MODEL_FILE_LIMIT, modelFormatOf } from '@/lib/db'
import { useSetVesselModelTransform, useUploadVesselModel } from '@/lib/query-hooks'
import {
  UNIT_SCALES,
  fitTransform,
  placedExtent,
  type Bounds,
  type HullDims,
  type ModelTransform,
  type VesselFileInfo,
} from '@/lib/vessel-model'
import type { Vessel } from '@/lib/types'

// The boat's own 3D file (migration 031): load it, set it square to the
// model frame, and save how it sits. Aligning is local until saved, so
// trying a half turn costs nothing and leaves no event in the log.

const muted = { color: 'hsl(var(--muted-foreground))' }

/** The unit a scale stands for, or null for a scale typed by hand. */
const unitOf = (scale: number) =>
  (Object.entries(UNIT_SCALES) as Array<[keyof typeof UNIT_SCALES, number]>).find(([, s]) => Math.abs(scale / s - 1) < 0.01)?.[0] ?? null

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span style={muted}>{label}</span>
      {children}
    </label>
  )
}

interface Props {
  vessel: Vessel | null | undefined
  dims: HullDims
  file: VesselFileInfo | null
  canEdit: boolean
  /** The file's own box once parsed; null while loading. */
  bounds: Bounds | null
  loading: boolean
  error: string | null
  /** What the scene shows: the unsaved alignment, else the saved one, else the automatic fit. */
  transform: ModelTransform | null
  /** True when `transform` is not what is saved. */
  dirty: boolean
  onDraft: (t: ModelTransform | null) => void
  opacity: number
  onOpacity: (v: number) => void
}

export default function VesselFilePanel({ vessel, dims, file, canEdit, bounds, loading, error, transform, dirty, onDraft, opacity, onOpacity }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadVesselModel()
  const save = useSetVesselModelTransform()
  const failed = (what: string) => (e: unknown) => toast.error(`Could not ${what}: ${e instanceof Error ? e.message : String(e)}`)

  const pick = (f: File | undefined) => {
    if (!f) return
    // Checked here as well as in db.ts so a 300 MB file is refused before it is read.
    if (!modelFormatOf(f.name)) return toast.error('Use a GLB, STL or OBJ file.')
    if (f.size > MODEL_FILE_LIMIT) return toast.error(`The file is ${(f.size / 1048576).toFixed(0)} MB; the limit is 50 MB. Export a lighter GLB.`)
    upload.mutate(f, {
      onSuccess: () => {
        onDraft(null)
        toast.success('Model loaded. Check it sits right, then save the alignment.')
      },
      onError: failed('load the model'),
    })
  }

  const chooser = (
    <input
      ref={input}
      type="file"
      accept=".glb,.stl,.obj"
      className="hidden"
      onChange={(e) => {
        pick(e.target.files?.[0])
        e.target.value = ''
      }}
    />
  )

  if (!vessel) {
    return (
      <p className="text-sm" style={muted}>
        <Link to="/app/project" className="underline">Record the vessel</Link> first; then her 3D model can be loaded here.
      </p>
    )
  }

  if (!file) {
    return (
      <div className="space-y-2">
        <p className="text-sm" style={muted}>
          Load the boat's own 3D model to replace the drawn hull: GLB (best), STL or OBJ, up to 50 MB.
        </p>
        {canEdit && (
          <Button size="sm" className="w-full" onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Upload size={14} className="mr-1" />}
            {upload.isPending ? 'Uploading…' : 'Load 3D model'}
          </Button>
        )}
        {chooser}
      </div>
    )
  }

  // Each turn keeps the scale and fits the position again, so the boat never
  // swings out of frame.
  const turn = (d: Partial<Pick<ModelTransform, 'rx' | 'ry' | 'rz'>>) => {
    if (!transform || !bounds) return
    const norm = (a: number) => ((a % 360) + 360) % 360
    const rot = {
      rx: norm(transform.rx + (d.rx ?? 0)),
      ry: norm(transform.ry + (d.ry ?? 0)),
      rz: norm(transform.rz + (d.rz ?? 0)),
    }
    onDraft(fitTransform(bounds, rot, dims, transform.scale))
  }
  const set = (patch: Partial<ModelTransform>) => transform && onDraft({ ...transform, ...patch })
  const extent = transform && bounds ? placedExtent(bounds, transform) : null
  const unit = transform ? unitOf(transform.scale) : null
  const num = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v))

  return (
    <div className="space-y-2">
      <div className="text-sm">
        <div className="truncate font-medium" title={file.name}>{file.name}</div>
        <div className="text-xs" style={muted}>
          {file.format.toUpperCase()}
          {file.bytes ? ` · ${(file.bytes / 1048576).toFixed(1)} MB` : ''}
          {loading ? ' · loading…' : error ? '' : dirty ? ' · alignment not saved' : ' · aligned'}
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>

      {extent && (
        <p className="text-xs" style={muted}>
          Sits {extent.x.toFixed(1)} m long, {extent.z.toFixed(1)} m wide, {extent.y.toFixed(1)} m high
          {Math.abs(extent.x - dims.loa) / dims.loa > 0.15 && !dims.assumed ? (
            <span className="text-amber-600 dark:text-amber-400"> — the record says LOA {dims.loa} m: check the units.</span>
          ) : null}
        </p>
      )}

      <Field label="Opacity">
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onOpacity(Number(e.target.value))}
          className="w-28 accent-[hsl(var(--accent))]"
        />
      </Field>

      {canEdit && transform && bounds && (
        <div className="space-y-2 border-t pt-2">
          <Field label="File units">
            <select
              className="h-7 rounded border bg-background px-1 text-xs"
              value={unit ?? 'custom'}
              onChange={(e) => {
                const s = UNIT_SCALES[e.target.value as keyof typeof UNIT_SCALES]
                if (s) onDraft(fitTransform(bounds, transform, dims, s))
              }}
            >
              {!unit && <option value="custom">custom ×{transform.scale}</option>}
              {Object.keys(UNIT_SCALES).map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => turn({ ry: 180 })} title="The bow is where the stern should be">
              <FlipHorizontal2 size={12} className="mr-1" /> Bow ↔ stern
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => turn({ ry: 90 })} title="Quarter turn about the vertical">
              <RotateCw size={12} className="mr-1" /> Turn 90°
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => turn({ rx: 90 })} title="Lying on her side or upside down: quarter turn about the fore-and-aft axis">
              <RotateCw size={12} className="mr-1" /> Roll 90°
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => turn({ rz: 90 })} title="Standing on her bow or stern: quarter turn about the athwartships axis">
              <RotateCw size={12} className="mr-1" /> Pitch 90°
            </Button>
          </div>
          {/* Offsets in the model frame; the waterline is y = 0. */}
          {([
            ['Forward (m)', 'x'],
            ['Up from waterline (m)', 'y'],
            ['To starboard (m)', 'z'],
          ] as const).map(([label, k]) => (
            <Field key={k} label={label}>
              <Input
                type="number"
                step={0.05}
                className="h-7 w-24 px-2 text-xs"
                value={transform[k]}
                onChange={(e) => {
                  const n = num(e.target.value)
                  if (n !== null) set({ [k]: n })
                }}
              />
            </Field>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs"
            onClick={() => onDraft(fitTransform(bounds, transform, dims))}
            title="Guess the units from the LOA, centre the boat and put her lowest point at the recorded draft"
          >
            <Wand2 size={12} className="mr-1" /> Fit to LOA and draft
          </Button>
          {dirty && (
            <div className="flex gap-1">
              <Button
                size="sm"
                className="flex-1"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(transform, {
                    onSuccess: () => {
                      onDraft(null)
                      toast.success('Alignment saved')
                    },
                    onError: failed('save the alignment'),
                  })
                }
              >
                <Save size={13} className="mr-1" /> Save alignment
              </Button>
              <Button size="sm" variant="outline" onClick={() => onDraft(null)}>Undo</Button>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-1 border-t pt-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => input.current?.click()} disabled={upload.isPending}>
            {upload.isPending ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Upload size={13} className="mr-1" />}
            Replace
          </Button>
          <Button
            size="sm"
            variant="outline"
            title="Go back to the hull drawn from LOA, beam and draft. The file stays in the project's records."
            disabled={save.isPending}
            onClick={() => {
              if (!window.confirm('Stop using this model and go back to the drawn hull? The file stays in the project records.')) return
              save.mutate(null, { onSuccess: () => onDraft(null), onError: failed('remove the model') })
            }}
          >
            <Trash2 size={13} />
          </Button>
          {chooser}
        </div>
      )}
    </div>
  )
}

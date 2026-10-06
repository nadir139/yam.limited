import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSetProjectVessel } from '@/lib/query-hooks'
import type { ClassSociety, Vessel } from '@/lib/types'

// Which boat the project is about.
//
// Only the name is required, the same rule as starting a project: a 46-foot
// classic has no class society and nobody has the hull number to hand on day
// one, and demanding it is how placeholder data gets typed in. A blank field is
// sent as "no change", so editing the year can never wipe the LOA.

const CLASS_SOCIETIES: ClassSociety[] = ['LLOYDS', 'BV', 'RINA', 'DNV', 'ABS', 'OTHER']

const selectClass = 'h-10 w-full rounded-md border px-3 text-sm shadow-sm'
const selectStyle = {
  borderColor: 'hsl(var(--border))',
  backgroundColor: 'hsl(var(--background))',
  color: 'hsl(var(--foreground))',
}

/** Text in, number or null out. A non-number is reported, not sent as 0. */
const toNumber = (v: string): number | null | 'invalid' => {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : 'invalid'
}

const str = (v: number | null | undefined) => (v == null ? '' : String(v))

export default function VesselDetailsForm({
  vessel,
  onDone,
}: {
  vessel: Vessel | null
  onDone: () => void
}) {
  const save = useSetProjectVessel()

  const [name, setName] = useState(vessel?.name ?? '')
  const [vesselType, setVesselType] = useState(vessel?.vessel_type ?? '')
  const [yearBuilt, setYearBuilt] = useState(str(vessel?.year_built))
  const [buildYard, setBuildYard] = useState(vessel?.build_yard ?? '')
  const [loa, setLoa] = useState(str(vessel?.loa))
  const [beam, setBeam] = useState(str(vessel?.beam))
  const [draft, setDraft] = useState(str(vessel?.draft))
  const [grossTonnage, setGrossTonnage] = useState(str(vessel?.gross_tonnage))
  const [hullId, setHullId] = useState(vessel?.hull_id ?? '')
  const [flagState, setFlagState] = useState(vessel?.flag_state ?? '')
  const [classSociety, setClassSociety] = useState<string>(vessel?.class_society ?? '')
  const [classNumber, setClassNumber] = useState(vessel?.class_number ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    const numbers = {
      yearBuilt: toNumber(yearBuilt),
      loa: toNumber(loa),
      beam: toNumber(beam),
      draft: toNumber(draft),
      grossTonnage: toNumber(grossTonnage),
    }
    const LABELS: Record<keyof typeof numbers, string> = {
      yearBuilt: 'Year built',
      loa: 'LOA',
      beam: 'Beam',
      draft: 'Draft',
      grossTonnage: 'Gross tonnage',
    }
    const bad = (Object.keys(numbers) as (keyof typeof numbers)[]).find(
      (k) => numbers[k] === 'invalid',
    )
    if (bad) {
      setError(`${LABELS[bad]} must be a number`)
      return
    }
    if (!vessel && !name.trim()) {
      setError('A vessel needs a name')
      return
    }

    save.mutate(
      {
        name: name.trim() || null,
        vesselType: vesselType.trim() || null,
        yearBuilt: numbers.yearBuilt as number | null,
        buildYard: buildYard.trim() || null,
        loa: numbers.loa as number | null,
        beam: numbers.beam as number | null,
        draft: numbers.draft as number | null,
        grossTonnage: numbers.grossTonnage as number | null,
        hullId: hullId.trim() || null,
        flagState: flagState.trim() || null,
        classSociety: (classSociety || null) as ClassSociety | null,
        classNumber: classNumber.trim() || null,
      },
      {
        onSuccess: onDone,
        onError: (e) => setError(e instanceof Error ? e.message : 'Could not save the vessel'),
      },
    )
  }

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    placeholder?: string,
    inputMode?: 'decimal' | 'numeric',
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </div>
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col gap-3"
    >
      {field('v-name', 'Name *', name, setName, 'e.g. Lucky Bird')}
      <div className="grid grid-cols-2 gap-3">
        {field('v-type', 'Type / model', vesselType, setVesselType, 'e.g. Swan 46')}
        {field('v-year', 'Year built', yearBuilt, setYearBuilt, 'e.g. 1974', 'numeric')}
      </div>
      {field('v-yard', 'Builder / build yard', buildYard, setBuildYard, "e.g. Nautor's Swan")}
      <div className="grid grid-cols-2 gap-3">
        {field('v-loa', 'LOA (m)', loa, setLoa, 'e.g. 14.1', 'decimal')}
        {field('v-beam', 'Beam (m)', beam, setBeam, 'e.g. 4.2', 'decimal')}
        {field('v-draft', 'Draft (m)', draft, setDraft, 'e.g. 2.4', 'decimal')}
        {field('v-gt', 'Gross tonnage', grossTonnage, setGrossTonnage, '', 'decimal')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('v-hull', 'Hull ID', hullId, setHullId)}
        {field('v-flag', 'Flag state', flagState, setFlagState, 'e.g. Italy')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-class">Class society</Label>
          <select
            id="v-class"
            value={classSociety}
            onChange={(e) => setClassSociety(e.target.value)}
            className={selectClass}
            style={selectStyle}
          >
            <option value="">None</option>
            {CLASS_SOCIETIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {field('v-classno', 'Class number', classNumber, setClassNumber)}
      </div>

      {vessel && (
        <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
          Fields left blank keep their current value. Every change is recorded with
          the previous value.
        </p>
      )}

      {error && (
        <p
          className="flex items-center gap-1.5 text-sm"
          style={{ color: 'hsl(var(--destructive))' }}
        >
          <AlertCircle size={14} />
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : vessel ? 'Save changes' : 'Add vessel'}
        </Button>
      </div>
    </form>
  )
}

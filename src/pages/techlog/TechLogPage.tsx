import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAircraftTotals, useFlights, usePermissions, useProject, useRecordFlight, useVoidFlight } from '@/lib/query-hooks'
import { homeFor } from '@/components/layout/nav'
import type { AircraftFlight } from '@/lib/db'
import { utcHHMM, utcTime } from '@/lib/techlog'

// An aircraft's technical log (migration 045): every flight with its block
// and airborne times and landings, adding up to the airframe's total time.
// Times are UTC, as aviation keeps them. A flight is never edited: a wrong
// one is voided with its reason and entered again, and the airframe hours
// after it are recomputed on the server.

const muted = { color: 'hsl(var(--muted-foreground))' }
const hhmm = (min: number | null) => (min == null ? '—' : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`)
const hours = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export default function TechLogPage() {
  const { data: project } = useProject()
  const kind = project?.vessel?.asset_kind
  const { can } = usePermissions()
  const { data: flights = [], isLoading } = useFlights()
  const { data: totals } = useAircraftTotals(kind === 'AIRCRAFT')
  const voidFlight = useVoidFlight()

  if (project && kind !== 'AIRCRAFT') return <Navigate to={homeFor(project.project_type, kind)} replace />

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Tech log</h1>
        <p className="flex flex-wrap gap-x-4 text-sm" style={muted}>
          <span>{project?.vessel?.name}</span>
          {totals && (
            <>
              <span>Total time <b className="text-foreground">{hours(Number(totals.total_hours))} h</b></span>
              <span>Landings <b className="text-foreground">{Number(totals.total_landings).toLocaleString('en-GB')}</b></span>
              <span>{totals.flights} flights recorded here</span>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-4 text-sm" style={muted}>Loading…</p>
            ) : flights.length === 0 ? (
              <p className="p-4 text-sm" style={muted}>
                No flights yet. Record the first one; give the airframe hours it had before on the Project page (Airframe hours when
                recorded here) so the total time is right.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs" style={muted}>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Route</th>
                    <th className="px-3 py-2">Block</th>
                    <th className="px-3 py-2">Air</th>
                    <th className="px-3 py-2">Ldg</th>
                    <th className="px-3 py-2">PIC</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {flights.map((f) => (
                    <FlightRow
                      key={f.id}
                      f={f}
                      canVoid={can('action_void_flight')}
                      onVoid={() => {
                        const reason = window.prompt('Why is this flight wrong? It stays in the log, struck through, and total time is recomputed.')
                        if (reason?.trim()) voidFlight.mutate({ id: f.id, reason: reason.trim() }, { onError: (e) => toast.error(e.message) })
                      }}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        {can('action_record_flight') && <FlightForm />}
      </div>
    </div>
  )
}

function FlightRow({ f, canVoid, onVoid }: { f: AircraftFlight; canVoid: boolean; onVoid: () => void }) {
  const voided = !!f.voided_at
  return (
    <tr className={`border-b last:border-0 ${voided ? 'opacity-60' : ''}`}>
      <td className={`px-3 py-2 font-mono text-xs ${voided ? 'line-through' : ''}`}>{format(parseISO(f.flight_date), 'd MMM yy')}</td>
      <td className={`px-3 py-2 ${voided ? 'line-through' : ''}`}>
        {f.departure} → {f.arrival}
        <div className="text-xs" style={muted}>
          {utcHHMM(f.block_off)}–{utcHHMM(f.block_on)} UTC{f.notes ? ` · ${f.notes}` : ''}
        </div>
        {voided && <div className="text-xs no-underline" style={{ color: 'hsl(var(--destructive))' }}>voided by {f.voided_by_name}: {f.void_reason}</div>}
      </td>
      <td className="px-3 py-2 font-mono">{hhmm(f.block_minutes)}</td>
      <td className="px-3 py-2 font-mono">{hhmm(f.air_minutes)}</td>
      <td className="px-3 py-2">{f.landings}</td>
      <td className="px-3 py-2 text-xs">{f.pic_name ?? '—'}<div style={muted}>{f.recorded_by_name}</div></td>
      <td className="px-3 py-2 text-right">
        {canVoid && !voided && (
          <button type="button" className="text-xs opacity-60 hover:opacity-100" onClick={onVoid}>
            Void
          </button>
        )}
      </td>
    </tr>
  )
}

function FlightForm() {
  const record = useRecordFlight()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [dep, setDep] = useState('')
  const [arr, setArr] = useState('')
  const [off, setOff] = useState('')
  const [on, setOn] = useState('')
  const [to, setTo] = useState('')
  const [ldg, setLdg] = useState('')
  const [landings, setLandings] = useState('1')
  const [pic, setPic] = useState('')
  const [notes, setNotes] = useState('')
  // One id per filled-in flight, so a double tap or a retry records it once.
  const [clientId, setClientId] = useState(() => crypto.randomUUID())

  const times = useMemo(() => {
    const blockOff = utcTime(date, off)
    const blockOn = blockOff ? utcTime(date, on, blockOff) : null
    const takeoff = blockOff && to ? utcTime(date, to, blockOff) : null
    const landing = takeoff && ldg ? utcTime(date, ldg, takeoff) : null
    const min = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null)
    return { blockOff, blockOn, takeoff, landing, block: min(blockOff, blockOn), air: min(takeoff, landing) }
  }, [date, off, on, to, ldg])

  const ready = dep.trim().length >= 2 && arr.trim().length >= 2 && times.blockOff && times.blockOn && (!to === !ldg)

  const submit = () =>
    record.mutate(
      {
        flightDate: date,
        departure: dep,
        arrival: arr,
        blockOff: times.blockOff!,
        blockOn: times.blockOn!,
        takeoffAt: times.takeoff,
        landingAt: times.landing,
        landings: Number(landings) || 0,
        picName: pic,
        notes,
        clientId,
      },
      {
        onSuccess: (r) => {
          toast.success(r.duplicate ? 'Already recorded' : `Recorded. Total time ${hours(Number(r.totals?.total_hours ?? 0))} h`)
          setDep(arr)
          setArr('')
          setOff('')
          setOn('')
          setTo('')
          setLdg('')
          setNotes('')
          setClientId(crypto.randomUUID())
        },
        onError: (e) => toast.error(e.message),
      },
    )

  return (
    <Card className="order-first lg:order-none">
      <CardContent className="flex flex-col gap-3 p-4 text-sm">
        <h2 className="text-base font-semibold">Record a flight</h2>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="fl-date">Date</Label>
            <Input id="fl-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fl-dep">From</Label>
            <Input id="fl-dep" placeholder="LIMJ" value={dep} onChange={(e) => setDep(e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label htmlFor="fl-arr">To</Label>
            <Input id="fl-arr" placeholder="LIRP" value={arr} onChange={(e) => setArr(e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label htmlFor="fl-off">Block off</Label>
            <Input id="fl-off" type="time" value={off} onChange={(e) => setOff(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fl-to">Takeoff</Label>
            <Input id="fl-to" type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fl-ldg">Landing</Label>
            <Input id="fl-ldg" type="time" value={ldg} onChange={(e) => setLdg(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fl-on">Block on</Label>
            <Input id="fl-on" type="time" value={on} onChange={(e) => setOn(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fl-landings">Landings</Label>
            <Input id="fl-landings" inputMode="numeric" value={landings} onChange={(e) => setLandings(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <Label htmlFor="fl-pic">PIC</Label>
            <Input id="fl-pic" value={pic} onChange={(e) => setPic(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="fl-notes">Remarks</Label>
          <Input id="fl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="text-xs" style={muted}>
          Times in UTC. Block {hhmm(times.block)} · air {hhmm(times.air)}
          {times.air == null ? ' (without takeoff and landing, block time counts toward total time)' : ''}.
          {!to !== !ldg && ' Give both takeoff and landing, or neither.'}
        </p>
        <Button size="sm" className="self-start" disabled={!ready || record.isPending} onClick={submit}>
          Record flight
        </Button>
      </CardContent>
    </Card>
  )
}

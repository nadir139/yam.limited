import { depthAt, halfBeamAt, hullDims, sheerAt, xAt, type HullDims } from '@/lib/vessel-model'

// A yacht's lines, drawn the way a design office draws them: profile, half
// breadths and a body plan, from the same hull maths the 3D model uses
// (vessel-model.ts). The public site uses these in place of photographs:
// they are ours, they say "naval architecture" without a word, and no owner's
// boat is shown.

export type Rig = 'sloop' | 'ketch' | 'schooner' | 'none'

interface Props {
  loa: number
  beam: number
  draft: number
  rig?: Rig
  /** Profile only (thumbnails), or profile + half breadths + body plan (the sheet). */
  view?: 'profile' | 'sheet'
  /** Draw itself once on mount. */
  animate?: boolean
  /** Dimension line and labels under the profile. */
  dims?: boolean
  className?: string
  title?: string
  /** Mast height as a fraction of the real proportion: a drawing need not show the whole rig. */
  mastScale?: number
}

const N = 48
const ts = Array.from({ length: N + 1 }, (_, i) => i / N)
const pts = (p: Array<[number, number]>) => p.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')

/** One section (station) as starboard half: sheer → waterline → keel. */
function section(d: HullDims, t: number): Array<[number, number]> {
  const hb = Math.max(halfBeamAt(d, t), 0.004)
  const sheer = sheerAt(d, t)
  const depth = depthAt(d, t)
  const out: Array<[number, number]> = [
    [hb * 0.95, sheer],
    [hb * 0.99, sheer * 0.66],
    [hb, sheer * 0.33],
    [hb * 0.99, 0],
  ]
  for (let j = 1; j <= 10; j++) {
    const a = (j / 10) * (Math.PI / 2)
    out.push([hb * 0.99 * Math.pow(Math.cos(a), 0.6), -depth * Math.sin(a)])
  }
  return out
}

export default function HullLines({ loa, beam, draft, rig = 'sloop', view = 'profile', animate = false, dims = false, className, title, mastScale = 1 }: Props) {
  const d = hullDims({ loa, beam, draft, vessel_type: rig === 'none' ? 'Motor vessel' : 'Sailing yacht' })
  const L = d.loa
  const mastH = (rig === 'none' ? 0 : rig === 'ketch' ? L * 1.15 : rig === 'schooner' ? L * 0.95 : L * 1.3) * mastScale

  // Profile in its own frame: x along the boat (bow to the right), y up.
  const sheer = ts.map((t) => [xAt(d, t), sheerAt(d, t)] as [number, number])
  const bottom = ts.map((t) => [xAt(d, t), -depthAt(d, t)] as [number, number])
  const hullOutline = [...sheer, ...bottom.slice().reverse(), sheer[0]]
  const keelX = xAt(d, 0.48)
  const keel: Array<[number, number]> = [
    [keelX - L * 0.07, -d.canoe * 0.55], [keelX + L * 0.07, -d.canoe * 0.55],
    [keelX + L * 0.03, -d.draft * 0.94], [keelX - L * 0.055, -d.draft * 0.94], [keelX - L * 0.07, -d.canoe * 0.55],
  ]
  const rudX = xAt(d, 0.1)
  const rudder: Array<[number, number]> = [
    [rudX - L * 0.025, -depthAt(d, 0.1) * 0.7], [rudX + L * 0.03, -depthAt(d, 0.1) * 0.7],
    [rudX + L * 0.012, -d.draft * 0.6], [rudX - L * 0.018, -d.draft * 0.6], [rudX - L * 0.025, -depthAt(d, 0.1) * 0.7],
  ]
  const masts: Array<{ x: number; h: number }> =
    rig === 'none' ? []
      : rig === 'ketch' ? [{ x: xAt(d, 0.62), h: mastH }, { x: xAt(d, 0.24), h: mastH * 0.72 }]
        : rig === 'schooner' ? [{ x: xAt(d, 0.72), h: mastH * 0.88 }, { x: xAt(d, 0.45), h: mastH }]
          : [{ x: xAt(d, 0.6), h: mastH }]
  const stations = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]

  const pad = L * 0.06
  const top = Math.max(...sheer.map((p) => p[1])) + (masts.length ? Math.max(...masts.map((m) => m.h)) : 0)
  const profileH = top + d.draft + pad * 2
  // Sheet: half breadths below the profile, body plan to the right.
  const planGap = pad * 1.5
  const planH = beam / 2 + pad
  const bodyW = beam * 1.4
  const W = L + pad * 2 + (view === 'sheet' ? bodyW + pad : 0)
  const H = profileH + (view === 'sheet' ? planGap + planH : 0) + (dims ? pad * 1.6 : 0)

  // SVG y grows downward: flip with a group transform per view.
  const profileY = top + pad
  const planY = profileH + planGap
  const bodyX = L / 2 + pad * 2 + bodyW / 2

  // Stroke unit relative to size, so every drawing reads alike; profiles are
  // shown small, so they get a heavier pen.
  const s = view === 'profile' ? L / 320 : L / 600
  const drawCls = animate ? 'draw' : undefined
  const pl = { pathLength: 1 } as const

  return (
    <svg
      viewBox={`${-L / 2 - pad} 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={title ?? 'Lines of a yacht'}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className={drawCls} transform={`translate(0 ${profileY}) scale(1 -1)`}>
        {/* Waterline */}
        <line x1={-L / 2 - pad * 0.6} y1={0} x2={L / 2 + pad * 0.6} y2={0} strokeWidth={s * 0.9} strokeDasharray={`${s * 8} ${s * 5}`} opacity={0.55} className="sea" {...(animate ? {} : {})} />
        {/* Stations */}
        {stations.map((t) => (
          <line key={t} x1={xAt(d, t)} y1={-depthAt(d, t)} x2={xAt(d, t)} y2={sheerAt(d, t)} strokeWidth={s * 0.6} opacity={0.35} {...pl} className="late" />
        ))}
        <polyline points={pts(hullOutline)} strokeWidth={s * 2.2} {...pl} />
        {rig !== 'none' && <polyline points={pts(keel)} strokeWidth={s * 1.8} {...pl} />}
        <polyline points={pts(rudder)} strokeWidth={s * 1.6} {...pl} />
        {masts.map((m, i) => {
          const base = sheerAt(d, (m.x + L / 2) / L)
          return (
            <g key={i}>
              <line x1={m.x} y1={base} x2={m.x} y2={base + m.h} strokeWidth={s * 1.8} {...pl} className="late" />
              {i === 0 && (
                <>
                  <line x1={m.x} y1={base + m.h * 0.98} x2={xAt(d, 0.995)} y2={sheerAt(d, 1)} strokeWidth={s * 0.7} opacity={0.6} {...pl} className="late" />
                  <line x1={m.x} y1={base + m.h * 0.98} x2={xAt(d, 0.02)} y2={sheerAt(d, 0)} strokeWidth={s * 0.7} opacity={0.6} {...pl} className="late" />
                </>
              )}
            </g>
          )
        })}
      </g>

      {view === 'sheet' && (
        <>
          {/* Half breadths: the deck line and the waterline, starboard half */}
          <g className={drawCls} transform={`translate(0 ${planY}) scale(1 1)`}>
            <line x1={-L / 2} y1={0} x2={L / 2} y2={0} strokeWidth={s * 0.7} opacity={0.5} {...pl} />
            <polyline points={pts(ts.map((t) => [xAt(d, t), halfBeamAt(d, t) * 0.95]))} strokeWidth={s * 1.8} {...pl} />
            <polyline points={pts(ts.map((t) => [xAt(d, t), halfBeamAt(d, t) * 0.99 * Math.min(1, 0.4 + depthAt(d, t) / Math.max(d.canoe, 0.01))]))} strokeWidth={s * 1} opacity={0.6} {...pl} className="late sea" />
            {stations.map((t) => (
              <line key={t} x1={xAt(d, t)} y1={0} x2={xAt(d, t)} y2={halfBeamAt(d, t) * 0.95} strokeWidth={s * 0.5} opacity={0.3} {...pl} className="late" />
            ))}
          </g>
          {/* Body plan: aft sections on the left, forward on the right */}
          <g className={drawCls} transform={`translate(${bodyX} ${profileY}) scale(1 -1)`}>
            <line x1={0} y1={-d.draft * 0.5} x2={0} y2={sheerAt(d, 1) * 1.15} strokeWidth={s * 0.6} opacity={0.4} {...pl} />
            <line x1={-beam * 0.6} y1={0} x2={beam * 0.6} y2={0} strokeWidth={s * 0.7} strokeDasharray={`${s * 8} ${s * 5}`} opacity={0.55} className="sea" />
            {[0.1, 0.2, 0.3, 0.4, 0.5].map((t) => (
              <polyline key={`a${t}`} points={pts(section(d, t).map(([z, y]) => [-z, y]))} strokeWidth={s * 1.1} opacity={0.85} {...pl} />
            ))}
            {[0.6, 0.7, 0.8, 0.9, 0.97].map((t) => (
              <polyline key={`f${t}`} points={pts(section(d, t))} strokeWidth={s * 1.1} opacity={0.85} {...pl} className="late" />
            ))}
          </g>
        </>
      )}

      {dims && (
        <g transform={`translate(0 ${H - pad * 0.9})`} opacity={0.7}>
          <line x1={-L / 2} y1={0} x2={L / 2} y2={0} strokeWidth={s * 0.8} />
          <line x1={-L / 2} y1={-pad * 0.25} x2={-L / 2} y2={pad * 0.25} strokeWidth={s * 0.8} />
          <line x1={L / 2} y1={-pad * 0.25} x2={L / 2} y2={pad * 0.25} strokeWidth={s * 0.8} />
          <text x={0} y={-pad * 0.25} textAnchor="middle" fill="currentColor" stroke="none" fontSize={L * 0.028} className="mono">
            LOA {L.toFixed(1)} m · BEAM {beam.toFixed(1)} m · DRAFT {draft.toFixed(1)} m
          </text>
        </g>
      )}
    </svg>
  )
}

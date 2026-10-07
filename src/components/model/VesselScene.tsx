import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Html, Line, OrbitControls } from '@react-three/drei'
import {
  CONNECTION_COLOURS,
  hullRings,
  xAt,
  sheerAt,
  type PlacedPart,
  type Vec3,
  type VesselModel,
} from '@/lib/vessel-model'

// The 3D half of YAManagement. Loaded on its own (React.lazy) so three.js only
// ships to people who open the model.

export interface SceneOptions {
  showSpaces: boolean
  showConnections: boolean
  showHull: boolean
}

interface Props {
  model: VesselModel
  /** Parts in the selected system, or null for the whole boat. */
  focus: Set<string> | null
  selectedPartId: string | null
  colourOf: (p: PlacedPart) => string
  options: SceneOptions
  onSelectPart: (id: string | null) => void
}

const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z)

function Hull({ model }: { model: VesselModel }) {
  const { dims } = model
  const rings = useMemo(() => hullRings(dims), [dims])

  // The skin: consecutive rings stitched into quads.
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = rings[0].length
    const pos: number[] = []
    for (const ring of rings) for (const p of ring) pos.push(p.x, p.y, p.z)
    const index: number[] = []
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < n; j++) {
        const a = i * n + j
        const b = i * n + ((j + 1) % n)
        const c = (i + 1) * n + j
        const d = (i + 1) * n + ((j + 1) % n)
        index.push(a, c, b, b, c, d)
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(index)
    g.computeVertexNormals()
    return g
  }, [rings])

  // Every fourth station drawn as a line, plus sheer and waterline: the
  // drawing-office look, and the skin stays readable from inside.
  const stations = rings.filter((_, i) => i % 4 === 0 || i === rings.length - 1)
  const sheerS = rings.map((r) => v(r[0]))
  const sheerP = rings.map((r) => v(r[r.length - 1]))
  const keel = rings.map((r) => v(r[Math.floor(r.length / 2)]))
  const half = dims.beam / 2

  return (
    <group>
      <mesh geometry={geometry} renderOrder={-1}>
        <meshStandardMaterial color="#64748b" transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {stations.map((r, i) => (
        <Line key={i} points={[...r.map(v), v(r[0])]} color="#64748b" lineWidth={0.6} transparent opacity={0.45} />
      ))}
      <Line points={sheerS} color="#475569" lineWidth={1.2} />
      <Line points={sheerP} color="#475569" lineWidth={1.2} />
      <Line points={keel} color="#475569" lineWidth={0.8} transparent opacity={0.6} />
      {/* Waterline plane, faint, so "below the waterline" reads at a glance. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[dims.loa * 1.2, half * 3]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {dims.sail && (
        <>
          {/* Fin keel and rudder, then the mast stepped a little forward of amidships. */}
          <mesh position={[xAt(dims, 0.48), -(dims.draft + dims.canoe * 0.6) / 2, 0]}>
            <boxGeometry args={[dims.loa * 0.11, dims.draft - dims.canoe * 0.4, 0.12]} />
            <meshStandardMaterial color="#64748b" transparent opacity={0.25} depthWrite={false} />
          </mesh>
          <mesh position={[xAt(dims, 0.1), -dims.draft * 0.42, 0]}>
            <boxGeometry args={[dims.loa * 0.05, dims.draft * 0.6, 0.06]} />
            <meshStandardMaterial color="#64748b" transparent opacity={0.25} depthWrite={false} />
          </mesh>
          <Line
            points={[
              [xAt(dims, 0.6), sheerAt(dims, 0.6), 0],
              [xAt(dims, 0.6), sheerAt(dims, 0.6) + dims.mastHeight, 0],
            ]}
            color="#475569"
            lineWidth={2}
          />
        </>
      )}
    </group>
  )
}

export default function VesselScene({ model, focus, selectedPartId, colourOf, options, onSelectPart }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const { dims } = model
  const byId = useMemo(() => new Map(model.parts.map((p) => [p.part.id, p])), [model.parts])
  const radius = Math.max(0.07, dims.loa * 0.007)

  // The selected part's neighbours, so its connections and their far ends
  // stand out even when they sit in another system.
  const neighbours = useMemo(() => {
    const out = new Set<string>()
    if (!selectedPartId) return out
    for (const c of model.connections) {
      if (c.from_part_id === selectedPartId) out.add(c.to_part_id)
      if (c.to_part_id === selectedPartId) out.add(c.from_part_id)
    }
    return out
  }, [model.connections, selectedPartId])

  const inFocus = (id: string) => !focus || focus.has(id) || neighbours.has(id) || id === selectedPartId

  const visibleConnections = model.connections.filter((c) =>
    selectedPartId
      ? c.from_part_id === selectedPartId || c.to_part_id === selectedPartId
      : !focus || focus.has(c.from_part_id) || focus.has(c.to_part_id),
  )

  const camera = useMemo(
    // Three-quarter view from starboard, far enough back for the hull to fit
    // the frame; the mast runs out of the top, which is what a mast does.
    () => ({ position: [dims.loa * 0.8, dims.loa * 0.65, dims.loa * 1.3] as [number, number, number], fov: 38, near: 0.05, far: dims.loa * 30 }),
    [dims.loa],
  )

  return (
    <Canvas camera={camera} dpr={[1, 2]} onPointerMissed={() => onSelectPart(null)}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      <OrbitControls makeDefault target={[0, dims.freeboard * 0.5, 0]} enableDamping maxDistance={dims.loa * 6} />

      {options.showHull && <Hull model={model} />}

      {options.showSpaces &&
        model.spaces.map((s) => (
          <group key={s.space.id} position={[s.box.center.x, s.box.center.y, s.box.center.z]}>
            <mesh>
              <boxGeometry args={[s.box.size.x, s.box.size.y, s.box.size.z]} />
              <meshBasicMaterial color="#84cc16" transparent opacity={0.05} depthWrite={false} />
            </mesh>
            <lineSegments>
              <edgesGeometry args={[new THREE.BoxGeometry(s.box.size.x, s.box.size.y, s.box.size.z)]} />
              <lineBasicMaterial color="#65a30d" transparent opacity={s.guessed ? 0.3 : 0.6} />
            </lineSegments>
            <Html position={[0, s.box.size.y / 2, 0]} center distanceFactor={dims.loa * 0.9} zIndexRange={[10, 0]}>
              <div className="pointer-events-none whitespace-nowrap rounded bg-background/80 px-1 text-[10px] font-medium text-lime-700 dark:text-lime-400">
                {s.space.name}
                {s.guessed ? ' ?' : ''}
              </div>
            </Html>
          </group>
        ))}

      {options.showConnections &&
        visibleConnections.map((c) => {
          const a = byId.get(c.from_part_id)
          const b = byId.get(c.to_part_id)
          if (!a || !b) return null
          const lit = selectedPartId === c.from_part_id || selectedPartId === c.to_part_id
          return (
            <Line
              key={c.id}
              points={[v(a.position), v(b.position)]}
              color={CONNECTION_COLOURS[c.kind] ?? CONNECTION_COLOURS.CONNECTED}
              lineWidth={lit ? 2.5 : 1.25}
              transparent
              opacity={lit || !selectedPartId ? 0.9 : 0.3}
              dashed={c.kind === 'SIGNALS'}
              dashSize={0.15}
              gapSize={0.1}
            />
          )
        })}

      {model.parts.map((p) => {
        const id = p.part.id
        const focused = inFocus(id)
        const selected = id === selectedPartId
        const colour = focused ? colourOf(p) : '#94a3b8'
        const r = selected ? radius * 2 : hovered === id ? radius * 1.6 : focused ? radius : radius * 0.6
        return (
          <mesh
            key={id}
            position={[p.position.x, p.position.y, p.position.z]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onSelectPart(selected ? null : id)
            }}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              setHovered(id)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setHovered((h) => (h === id ? null : h))
              document.body.style.cursor = ''
            }}
          >
            <sphereGeometry args={[r, 14, 14]} />
            <meshStandardMaterial
              color={colour}
              transparent={!focused}
              opacity={focused ? 1 : 0.35}
              emissive={selected ? colour : '#000000'}
              emissiveIntensity={selected ? 0.5 : 0}
            />
            {(selected || hovered === id || (neighbours.has(id) && !!selectedPartId)) && (
              <Html position={[0, r * 1.8, 0]} center zIndexRange={[20, 10]}>
                <div className="pointer-events-none whitespace-nowrap rounded border bg-background/95 px-1.5 py-0.5 text-[11px] font-medium shadow-sm">
                  {p.part.designation ? <span className="mr-1 font-mono text-muted-foreground">{p.part.designation}</span> : null}
                  {p.part.name}
                </div>
              </Html>
            )}
          </mesh>
        )
      })}
    </Canvas>
  )
}

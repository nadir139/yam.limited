import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Line, OrbitControls, TransformControls } from '@react-three/drei'
import {
  CONNECTION_COLOURS,
  hullRings,
  xAt,
  sheerAt,
  type Bounds,
  type Box,
  type ModelFormat,
  type ModelTransform,
  type PlacedPart,
  type Vec3,
  type VesselModel,
} from '@/lib/vessel-model'
import { disposeObject, parseVesselFile, rawBounds, setOpacity } from './vessel-file'

// The 3D half of YAManagement. Loaded on its own (React.lazy) so three.js only
// ships to people who open the model.

export interface SceneOptions {
  showSpaces: boolean
  showConnections: boolean
  /** The hull drawn from LOA, beam and draft. */
  showHull: boolean
  /** The boat's own 3D file, when one is loaded. */
  showFile: boolean
  /** Parts as boxes at their real size, or as same-size markers that are easy to see from afar. */
  realSize: boolean
}

/** The boat's own 3D file, read from Storage, and how it sits on the model frame. */
export interface SceneFile {
  /** Changes when the file does; the bytes are parsed again only then. */
  key: string
  buffer: ArrayBuffer
  format: ModelFormat
  /** Null until the file has been measured and fitted. */
  transform: ModelTransform | null
  opacity: number
  /** The file's own box, once parsed: the page fits and aligns from it. */
  onBounds: (b: Bounds) => void
  onError: (message: string) => void
}

interface Props {
  model: VesselModel
  /** Parts in the selected system, or null for the whole boat. */
  focus: Set<string> | null
  selectedPartId: string | null
  colourOf: (p: PlacedPart) => string
  options: SceneOptions
  onSelectPart: (id: string | null) => void
  selectedSpaceId: string | null
  onSelectSpace: (id: string | null) => void
  /** Layout editing: the selected space or part carries a drag handle. */
  editing: boolean
  editMode: 'move' | 'resize'
  onMoveSpace: (id: string, box: Box) => void
  onMovePart: (id: string, position: Vec3) => void
  /** A part resized with the handles: where it now is and its new size. */
  onResizePart: (id: string, position: Vec3, size: Vec3) => void
  file: SceneFile | null
  /** What the camera should fly to: the selected part or space. */
  goal: CameraGoal | null
  /** Bumped to frame the whole boat again. */
  fitKey: number
}

export interface CameraGoal {
  /** Fly again only when this changes, not every time the data refetches. */
  key: string
  target: Vec3
  distance: number
}

type Controls = { target: THREE.Vector3; update: () => void }

/** The object a TransformControls drag moved, from its mouseUp event. */
const dragged = (e?: THREE.Event) =>
  (e?.target as unknown as { object?: THREE.Object3D } | undefined)?.object ?? null

// Remount the drag handle whenever the stored value changes, so the moved
// group starts again from the saved position and scale rather than adding to it.
const boxKey = (b: Box) => [b.center.x, b.center.y, b.center.z, b.size.x, b.size.y, b.size.z].map((n) => n.toFixed(2)).join(',')

const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z)

/**
 * The uploaded model of the boat, in place of the drawn hull. Parsed once per
 * file; the alignment and opacity are applied to the same object afterwards,
 * so nudging the waterline does not re-read 40 MB.
 */
function VesselFile({ file }: { file: SceneFile }) {
  const [object, setObject] = useState<THREE.Object3D | null>(null)
  const { buffer, format, onBounds, onError } = file
  useEffect(() => {
    let cancelled = false
    let parsed: THREE.Object3D | null = null
    parseVesselFile(buffer, format)
      .then((o) => {
        if (cancelled) return disposeObject(o)
        const b = rawBounds(o)
        if (!b) throw new Error('The file has no geometry in it')
        parsed = o
        onBounds(b)
        setObject(o)
      })
      .catch((e: unknown) => !cancelled && onError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
      if (parsed) disposeObject(parsed)
      setObject(null)
    }
    // Parse again only for another file, not when the callbacks are recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.key])
  useEffect(() => {
    if (object) setOpacity(object, file.opacity)
  }, [object, file.opacity])
  const t = file.transform
  if (!object || !t) return null
  const r = THREE.MathUtils.degToRad
  return <primitive object={object} position={[t.x, t.y, t.z]} rotation={[r(t.rx), r(t.ry), r(t.rz)]} scale={t.scale} />
}

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

/**
 * Backs the camera off until the whole hull fits across the frame. A phone
 * held upright is a narrow window, so it needs to stand much further away
 * than a desktop. Runs when the frame changes shape, not on every orbit.
 */
function FitCamera({ loa, target, fitKey }: { loa: number; target: [number, number, number]; fitKey: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  useEffect(() => {
    const vfov = THREE.MathUtils.degToRad(camera.fov)
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect)
    // The hull seen three-quarters on is about 0.62 LOA either side of centre.
    const distance = Math.max(loa * 1.4, (loa * 0.62) / Math.tan(hfov / 2))
    const dir = new THREE.Vector3(0.8, 0.65, 1.3).normalize()
    camera.position.set(target[0], target[1], target[2]).addScaledVector(dir, distance)
    camera.lookAt(...target)
    controls?.target.set(...target)
    controls?.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, loa, camera, controls, fitKey])
  return null
}

/**
 * Glides the camera to what was just picked, keeping the angle it was seen
 * from, so tapping a part on a phone brings it up close instead of leaving a
 * dot among two hundred. Eased over 0.7 s; a drag mid-flight takes over.
 */
function FlyTo({ goal }: { goal: CameraGoal | null }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const flight = useRef<{ fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3; t: number } | null>(null)
  useEffect(() => {
    if (!goal || !controls) return
    const toT = v(goal.target)
    const dir = camera.position.clone().sub(controls.target).normalize()
    flight.current = {
      fromT: controls.target.clone(),
      toT,
      fromP: camera.position.clone(),
      toP: toT.clone().addScaledVector(dir, goal.distance),
      t: 0,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.key, controls])
  useFrame((_, dt) => {
    const f = flight.current
    if (!f || !controls) return
    f.t = Math.min(1, f.t + dt / 0.7)
    const k = 1 - Math.pow(1 - f.t, 3)
    controls.target.lerpVectors(f.fromT, f.toT, k)
    camera.position.lerpVectors(f.fromP, f.toP, k)
    controls.update()
    if (f.t >= 1) flight.current = null
  })
  return null
}

export default function VesselScene({
  model,
  focus,
  selectedPartId,
  colourOf,
  options,
  onSelectPart,
  selectedSpaceId,
  onSelectSpace,
  editing,
  editMode,
  onMoveSpace,
  onMovePart,
  onResizePart,
  file,
  goal,
  fitKey,
}: Props) {
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

  // Space names: every one when nothing is picked or the layout is being
  // edited (they are the handles); otherwise only the picked space and what
  // is inside it, or the space the picked part sits in. Up close, twenty
  // labels hide the very thing that was picked.
  const labelled = useMemo(() => {
    if (editing || (!selectedSpaceId && !selectedPartId)) return null
    const keep = new Set<string>()
    if (selectedSpaceId) {
      keep.add(selectedSpaceId)
      for (const sp of model.spaces) if (sp.space.parent_id === selectedSpaceId) keep.add(sp.space.id)
    }
    const sid = selectedPartId ? byId.get(selectedPartId)?.part.space_id : null
    if (sid) keep.add(sid)
    return keep
  }, [editing, selectedSpaceId, selectedPartId, model.spaces, byId])

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
    // While editing, a tap that misses everything keeps the selection: on a
    // phone it is too easy to miss the handle by a few pixels.
    <Canvas camera={camera} dpr={[1, 2]} onPointerMissed={() => !editing && onSelectPart(null)}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      <OrbitControls makeDefault target={[0, dims.freeboard * 0.5, 0]} enableDamping maxDistance={dims.loa * 8} />
      <FitCamera loa={dims.loa} target={[0, dims.freeboard * 0.5, 0]} fitKey={fitKey} />
      <FlyTo goal={goal} />

      {options.showHull && <Hull model={model} />}
      {options.showFile && file && <VesselFile file={file} />}

      {options.showSpaces &&
        model.spaces.map((s) => {
          const id = s.space.id
          const sel = id === selectedSpaceId
          const body = (
            <>
              <mesh>
                <boxGeometry args={[s.box.size.x, s.box.size.y, s.box.size.z]} />
                <meshBasicMaterial color={sel ? '#14b8a6' : '#84cc16'} transparent opacity={sel ? 0.12 : 0.05} depthWrite={false} />
              </mesh>
              <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(s.box.size.x, s.box.size.y, s.box.size.z)]} />
                <lineBasicMaterial color={sel ? '#0d9488' : '#65a30d'} transparent opacity={sel ? 1 : s.guessed ? 0.3 : 0.6} />
              </lineSegments>
              {/* The label is the handle for picking a space: the box itself
                  would swallow taps meant for the parts inside it. */}
              {(!labelled || labelled.has(id)) && (
              <Html position={[0, s.box.size.y / 2, 0]} center zIndexRange={[10, 0]}>
                <button
                  type="button"
                  onClick={() => onSelectSpace(sel ? null : id)}
                  className={`whitespace-nowrap rounded px-1 text-[10px] font-medium ${
                    sel ? 'bg-teal-600 text-white' : 'bg-background/80 text-lime-700 dark:text-lime-400'
                  }`}
                >
                  {s.space.name}
                  {s.guessed ? ' ?' : ''}
                </button>
              </Html>
              )}
            </>
          )
          if (editing && sel) {
            return (
              <TransformControls
                key={`${id}:${boxKey(s.box)}:${editMode}`}
                position={[s.box.center.x, s.box.center.y, s.box.center.z]}
                mode={editMode === 'resize' ? 'scale' : 'translate'}
                translationSnap={0.05}
                scaleSnap={0.05}
                size={0.9}
                onMouseUp={(e) => {
                  const o = dragged(e)
                  if (!o) return
                  onMoveSpace(id, {
                    center: { x: o.position.x, y: o.position.y, z: o.position.z },
                    size: { x: s.box.size.x * o.scale.x, y: s.box.size.y * o.scale.y, z: s.box.size.z * o.scale.z },
                  })
                }}
              >
                {body}
              </TransformControls>
            )
          }
          return (
            <group key={id} position={[s.box.center.x, s.box.center.y, s.box.center.z]}>
              {body}
            </group>
          )
        })}

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
        const lit = selected || hovered === id
        const colour = focused ? colourOf(p) : '#94a3b8'
        const handle = editing && selected
        const real = options.realSize
        // As markers, one size for all; at real size, the part's own box,
        // with an invisible ball around anything smaller than a fingertip so
        // a breaker can still be tapped from across the boat.
        const r = selected ? radius * 1.5 : hovered === id ? radius * 1.4 : focused ? radius : radius * 0.6
        const s = p.size
        const top = real ? s.y / 2 : r
        const material = (
          <meshStandardMaterial
            color={colour}
            transparent={!focused}
            opacity={focused ? 1 : 0.35}
            emissive={lit ? colour : '#000000'}
            emissiveIntensity={selected ? 0.5 : lit ? 0.25 : 0}
          />
        )
        const marker = (
          <group
            key={id}
            position={handle ? [0, 0, 0] : [p.position.x, p.position.y, p.position.z]}
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
            {real ? (
              <>
                <mesh>
                  <boxGeometry args={[s.x, s.y, s.z]} />
                  {material}
                </mesh>
                {lit && (
                  <lineSegments>
                    <edgesGeometry args={[new THREE.BoxGeometry(s.x, s.y, s.z)]} />
                    <lineBasicMaterial color={selected ? '#0f172a' : colour} />
                  </lineSegments>
                )}
                {Math.max(s.x, s.y, s.z) < radius * 2 && (
                  <mesh>
                    <sphereGeometry args={[radius, 8, 8]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
                  </mesh>
                )}
              </>
            ) : (
              <mesh>
                <sphereGeometry args={[r, 14, 14]} />
                {material}
              </mesh>
            )}
            {(lit || (neighbours.has(id) && !!selectedPartId)) && (
              <Html position={[0, top + Math.max(r * 0.8, 0.05), 0]} center zIndexRange={[20, 10]}>
                <div className="pointer-events-none whitespace-nowrap rounded border bg-background/95 px-1.5 py-0.5 text-[11px] font-medium shadow-sm">
                  {p.part.designation ? <span className="mr-1 font-mono text-muted-foreground">{p.part.designation}</span> : null}
                  {p.part.name}
                </div>
              </Html>
            )}
          </group>
        )
        if (!handle) return marker
        const resizing = editMode === 'resize' && real
        return (
          <TransformControls
            key={`${id}:${[p.position.x, p.position.y, p.position.z, s.x, s.y, s.z].map((n) => n.toFixed(3)).join(',')}:${editMode}`}
            position={[p.position.x, p.position.y, p.position.z]}
            mode={resizing ? 'scale' : 'translate'}
            translationSnap={0.05}
            scaleSnap={0.05}
            size={0.9}
            onMouseUp={(e) => {
              const o = dragged(e)
              if (!o) return
              const at = { x: o.position.x, y: o.position.y, z: o.position.z }
              if (resizing) onResizePart(id, at, { x: s.x * o.scale.x, y: s.y * o.scale.y, z: s.z * o.scale.z })
              else onMovePart(id, at)
            }}
          >
            {marker}
          </TransformControls>
        )
      })}
    </Canvas>
  )
}

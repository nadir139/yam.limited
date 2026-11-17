import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  Billboard,
  ContactShadows,
  Environment,
  Grid,
  Html,
  Lightformer,
  Line,
  OrbitControls,
  RoundedBox,
  TransformControls,
} from '@react-three/drei'
import { useTheme } from 'next-themes'
import {
  CONNECTION_COLOURS,
  depthAt,
  halfBeamAt,
  xAt,
  sheerAt,
  type HullDims,
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

// ─── The drawn hull ──────────────────────────────────────────────────────────
//
// Visual only: parts and spaces are placed by vessel-model.ts (halfBeamAt,
// sheerAt, depthAt), and this draws a skin around the same numbers. Flared
// topsides with a little tumblehome, a boot stripe on the waterline, antifouling
// below it and a deck of its own, so it reads as a yacht rather than a box.

const HULL = {
  topsides: new THREE.Color('#f8fafc'),
  stripe: new THREE.Color('#0f766e'),
  bottom: new THREE.Color('#1e3a5f'),
  deck: '#d6c3a0',
  line: '#64748b',
}

/** One ring: starboard sheer → waterline → keel → port sheer, with a colour per point. */
function hullRing(dims: HullDims, t: number, bilge = 9) {
  const x = xAt(dims, t)
  const hb = Math.max(halfBeamAt(dims, t), 0.004)
  const sheer = sheerAt(dims, t)
  const depth = depthAt(dims, t)
  const stripeTop = dims.freeboard * 0.09
  // Topsides: tumblehome at the sheer, widest a little above the waterline.
  const side: Array<{ p: Vec3; c: THREE.Color }> = [
    { p: { x, y: sheer, z: hb * 0.95 }, c: HULL.topsides },
    { p: { x, y: sheer * 0.66, z: hb * 0.99 }, c: HULL.topsides },
    { p: { x, y: sheer * 0.33, z: hb }, c: HULL.topsides },
    { p: { x, y: stripeTop * 1.01, z: hb * 0.995 }, c: HULL.topsides },
    { p: { x, y: stripeTop, z: hb * 0.995 }, c: HULL.stripe },
    { p: { x, y: 0.001, z: hb * 0.99 }, c: HULL.stripe },
    { p: { x, y: 0, z: hb * 0.99 }, c: HULL.bottom },
  ]
  // Below the waterline: a soft bilge into a slack keel line.
  for (let j = 1; j <= bilge; j++) {
    const a = (j / bilge) * (Math.PI / 2)
    side.push({ p: { x, y: -depth * Math.sin(a), z: hb * 0.99 * Math.pow(Math.cos(a), 0.6) }, c: HULL.bottom })
  }
  const port = side.slice(0, -1).reverse().map(({ p, c }) => ({ p: { ...p, z: -p.z }, c }))
  return [...side, ...port]
}

function Hull({ model, dark }: { model: VesselModel; dark: boolean }) {
  const { dims } = model
  const STATIONS = 48
  const rings = useMemo(() => Array.from({ length: STATIONS + 1 }, (_, i) => hullRing(dims, i / STATIONS)), [dims])

  // The skin: consecutive rings stitched into quads, open across the deck.
  const skin = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = rings[0].length
    const pos: number[] = []
    const col: number[] = []
    for (const ring of rings)
      for (const { p, c } of ring) {
        pos.push(p.x, p.y, p.z)
        col.push(c.r, c.g, c.b)
      }
    const index: number[] = []
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < n - 1; j++) {
        const a = i * n + j
        const b = a + 1
        const c = (i + 1) * n + j
        const d = c + 1
        index.push(a, c, b, b, c, d)
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setIndex(index)
    g.computeVertexNormals()
    return g
  }, [rings])

  // The deck: a strip between the two sheer lines.
  const deck = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos: number[] = []
    for (const r of rings) {
      const sb = r[0].p
      const ps = r[r.length - 1].p
      pos.push(sb.x, sb.y, sb.z, ps.x, ps.y, ps.z)
    }
    const index: number[] = []
    for (let i = 0; i < rings.length - 1; i++) {
      const a = i * 2
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(index)
    g.computeVertexNormals()
    return g
  }, [rings])

  useEffect(() => () => {
    skin.dispose()
    deck.dispose()
  }, [skin, deck])

  const stations = rings.filter((_, i) => i > 0 && i < rings.length - 1 && i % 6 === 0)
  const sheerS = rings.map((r) => v(r[0].p))
  const sheerP = rings.map((r) => v(r[r.length - 1].p))
  const keel = rings.map((r) => v(r[Math.floor(r.length / 2)].p))
  const stripeS = rings.map((r) => v(r[4].p))
  const stripeP = rings.map((r) => v(r[r.length - 5].p))
  const lineColour = dark ? '#94a3b8' : HULL.line

  return (
    <group>
      <mesh geometry={skin} renderOrder={-1}>
        <meshPhysicalMaterial
          vertexColors
          transparent
          opacity={0.32}
          roughness={0.28}
          metalness={0.05}
          clearcoat={1}
          clearcoatRoughness={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={deck} renderOrder={-1}>
        <meshStandardMaterial color={HULL.deck} transparent opacity={0.16} roughness={0.8} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {stations.map((r, i) => (
        <Line key={i} points={r.map(({ p }) => v(p))} color={lineColour} lineWidth={0.5} transparent opacity={0.18} />
      ))}
      <Line points={sheerS} color={lineColour} lineWidth={1.4} transparent opacity={0.85} />
      <Line points={sheerP} color={lineColour} lineWidth={1.4} transparent opacity={0.85} />
      <Line points={stripeS} color="#0f766e" lineWidth={1.6} transparent opacity={0.8} />
      <Line points={stripeP} color="#0f766e" lineWidth={1.6} transparent opacity={0.8} />
      <Line points={keel} color={lineColour} lineWidth={0.8} transparent opacity={0.4} />
      {dims.sail && <Rig dims={dims} lineColour={lineColour} />}
    </group>
  )
}

/** A trapezoid foil in the centreline plane (keel or rudder), extruded to a thickness. */
function foil(top: [number, number], bottom: [number, number], yTop: number, yBottom: number, thickness: number) {
  const shape = new THREE.Shape()
  shape.moveTo(top[0], yTop)
  shape.lineTo(top[1], yTop)
  shape.lineTo(bottom[1], yBottom)
  shape.lineTo(bottom[0], yBottom)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.45,
    bevelSize: thickness * 0.45,
    bevelSegments: 3,
  })
  g.translate(0, 0, -thickness / 2)
  return g
}

/** Fin keel with a bulb, a spade rudder, the mast, boom and stays. */
function Rig({ dims, lineColour }: { dims: HullDims; lineColour: string }) {
  const parts = useMemo(() => {
    const L = dims.loa
    const t = Math.max(0.04, dims.beam * 0.025)
    const keelX = xAt(dims, 0.48)
    const keelTop = -dims.canoe * 0.55
    const keel = foil(
      [keelX - L * 0.07, keelX + L * 0.07],
      [keelX - L * 0.055, keelX + L * 0.03],
      keelTop,
      -dims.draft * 0.94,
      t,
    )
    const rudX = xAt(dims, 0.1)
    const rudder = foil(
      [rudX - L * 0.025, rudX + L * 0.03],
      [rudX - L * 0.018, rudX + L * 0.012],
      -depthAt(dims, 0.1) * 0.7,
      -dims.draft * 0.6,
      t * 0.7,
    )
    return { keel, rudder, bulb: { x: keelX - L * 0.015, y: -dims.draft * 0.95, r: [L * 0.06, dims.draft * 0.06, dims.beam * 0.045] as const } }
  }, [dims])
  useEffect(() => () => {
    parts.keel.dispose()
    parts.rudder.dispose()
  }, [parts])

  const mastX = xAt(dims, 0.6)
  const deckY = sheerAt(dims, 0.6)
  const top = deckY + dims.mastHeight
  const mastR = Math.max(0.03, dims.loa * 0.0045)
  const boomY = deckY + dims.loa * 0.08
  const appendage = <meshPhysicalMaterial color={HULL.bottom} transparent opacity={0.55} roughness={0.4} clearcoat={0.6} />

  return (
    <group>
      <mesh geometry={parts.keel}>{appendage}</mesh>
      <mesh geometry={parts.rudder}>{appendage}</mesh>
      <mesh position={[parts.bulb.x, parts.bulb.y, 0]} scale={[...parts.bulb.r]}>
        <sphereGeometry args={[1, 32, 16]} />
        {appendage}
      </mesh>
      {/* Mast and boom */}
      <mesh position={[mastX, deckY + dims.mastHeight / 2, 0]}>
        <cylinderGeometry args={[mastR * 0.7, mastR, dims.mastHeight, 12]} />
        <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[mastX - dims.loa * 0.17, boomY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[mastR * 0.6, mastR * 0.6, dims.loa * 0.34, 10]} />
        <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.35} />
      </mesh>
      {/* Forestay and backstay */}
      <Line points={[[mastX, top, 0], [xAt(dims, 0.995), sheerAt(dims, 1), 0]]} color={lineColour} lineWidth={0.8} transparent opacity={0.55} />
      <Line points={[[mastX, top, 0], [xAt(dims, 0.01), sheerAt(dims, 0), 0]]} color={lineColour} lineWidth={0.8} transparent opacity={0.55} />
    </group>
  )
}

/** Sea at the waterline: a disc that fades out, so the hull sits in water rather than on a sheet. */
function Water({ loa, dark }: { loa: number; dark: boolean }) {
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    const rgb = dark ? '56,189,248' : '14,165,233'
    grad.addColorStop(0, `rgba(${rgb},0.22)`)
    grad.addColorStop(0.55, `rgba(${rgb},0.12)`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [dark])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={-2}>
      <circleGeometry args={[loa * 1.15, 64]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

/** A soft ring that breathes around the picked part, so it is found at a glance. */
function SelectionHalo({ size }: { size: number }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const k = 1 + 0.12 * Math.sin(clock.elapsedTime * 3)
    ref.current.scale.setScalar(k)
  })
  return (
    <Billboard>
      <mesh ref={ref} renderOrder={5}>
        <ringGeometry args={[size * 1.25, size * 1.5, 48]} />
        <meshBasicMaterial color="#14b8a6" transparent opacity={0.85} depthTest={false} />
      </mesh>
    </Billboard>
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
  // A slow turntable until the first touch: the boat presents itself.
  const [touched, setTouched] = useState(false)
  const dark = useTheme().resolvedTheme === 'dark'
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
    <Canvas
      camera={camera}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={() => !editing && onSelectPart(null)}
      // A studio backdrop from the theme's own colours, light or dark.
      style={{
        background: dark
          ? 'radial-gradient(120% 90% at 50% 15%, hsl(222 30% 16%) 0%, hsl(222 40% 7%) 100%)'
          : 'radial-gradient(120% 90% at 50% 15%, #ffffff 0%, hsl(210 30% 93%) 100%)',
      }}
    >
      {/* Studio light: sky and ground fill, one key light, and soft reflections
          from light panels (generated here, nothing downloaded). */}
      <hemisphereLight args={[dark ? '#cbd5e1' : '#ffffff', dark ? '#0f172a' : '#cbd5e1', dark ? 0.55 : 0.75]} />
      <directionalLight position={[dims.loa * 0.6, dims.loa * 1.4, dims.loa * 0.9]} intensity={dark ? 1.1 : 1.5} />
      <directionalLight position={[-dims.loa, dims.loa * 0.5, -dims.loa * 0.6]} intensity={0.35} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={2} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1} position={[-8, 2, 4]} rotation={[0, Math.PI / 3, 0]} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[8, 1, -4]} rotation={[0, -Math.PI / 3, 0]} scale={[8, 3, 1]} />
      </Environment>
      <OrbitControls
        makeDefault
        target={[0, dims.freeboard * 0.5, 0]}
        enableDamping
        dampingFactor={0.08}
        maxDistance={dims.loa * 8}
        autoRotate={!touched && !editing && !selectedPartId && !selectedSpaceId}
        autoRotateSpeed={0.35}
        onStart={() => setTouched(true)}
      />
      <FitCamera loa={dims.loa} target={[0, dims.freeboard * 0.5, 0]} fitKey={fitKey} />
      <FlyTo goal={goal} />

      {/* Sea, a floor grid under the keel, and the boat's shadow on it */}
      <Water loa={dims.loa} dark={dark} />
      <Grid
        position={[0, -dims.draft - 0.05, 0]}
        infiniteGrid
        cellSize={Math.max(0.25, Math.round(dims.loa / 30 * 4) / 4)}
        sectionSize={Math.max(1, Math.round(dims.loa / 6))}
        cellThickness={0.6}
        sectionThickness={1}
        cellColor={dark ? '#1e293b' : '#e2e8f0'}
        sectionColor={dark ? '#334155' : '#cbd5e1'}
        fadeDistance={dims.loa * 3}
        fadeStrength={1.5}
      />
      <ContactShadows
        key={model.parts.length}
        position={[0, -dims.draft - 0.04, 0]}
        scale={dims.loa * 1.6}
        far={dims.draft + dims.freeboard * 1.5}
        blur={2.6}
        opacity={dark ? 0.5 : 0.3}
        resolution={512}
        frames={1}
      />

      {options.showHull && <Hull model={model} dark={dark} />}
      {options.showFile && file && <VesselFile file={file} />}

      {options.showSpaces &&
        model.spaces.map((s) => {
          const id = s.space.id
          const sel = id === selectedSpaceId
          const body = (
            <>
              <mesh>
                <boxGeometry args={[s.box.size.x, s.box.size.y, s.box.size.z]} />
                <meshBasicMaterial color={sel ? '#14b8a6' : '#94a3b8'} transparent opacity={sel ? 0.12 : 0.035} depthWrite={false} />
              </mesh>
              <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(s.box.size.x, s.box.size.y, s.box.size.z)]} />
                <lineBasicMaterial color={sel ? '#0d9488' : '#94a3b8'} transparent opacity={sel ? 1 : s.guessed ? 0.18 : 0.38} />
              </lineSegments>
              {/* The label is the handle for picking a space: the box itself
                  would swallow taps meant for the parts inside it. */}
              {(!labelled || labelled.has(id)) && (
              <Html position={[0, s.box.size.y / 2, 0]} center zIndexRange={[10, 0]}>
                <button
                  type="button"
                  onClick={() => onSelectSpace(sel ? null : id)}
                  className={`whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-medium shadow-sm ring-1 backdrop-blur-sm transition-colors ${
                    sel
                      ? 'bg-teal-600 text-white ring-teal-700'
                      : 'bg-background/70 text-slate-600 ring-black/5 hover:bg-background hover:text-foreground dark:text-slate-300 dark:ring-white/10'
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
              lineWidth={lit ? 2.5 : 1}
              transparent
              opacity={lit ? 1 : selectedPartId ? 0.12 : 0.45}
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
            opacity={focused ? 1 : 0.3}
            roughness={0.38}
            metalness={0.12}
            envMapIntensity={0.9}
            emissive={lit ? colour : '#000000'}
            emissiveIntensity={selected ? 0.45 : lit ? 0.22 : 0}
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
                <RoundedBox args={[s.x, s.y, s.z]} radius={Math.min(s.x, s.y, s.z) * 0.14} smoothness={3}>
                  {material}
                </RoundedBox>
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
                <sphereGeometry args={[r, 24, 18]} />
                {material}
              </mesh>
            )}
            {selected && <SelectionHalo size={Math.max(real ? Math.max(s.x, s.y, s.z) / 2 : r, dims.loa * 0.012)} />}
            {(lit || (neighbours.has(id) && !!selectedPartId)) && (
              <Html position={[0, top + Math.max(r * 0.8, 0.05), 0]} center zIndexRange={[20, 10]}>
                <div className="pointer-events-none whitespace-nowrap rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-medium shadow-md ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
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

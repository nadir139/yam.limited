import * as THREE from 'three'
import type { Bounds, ModelFormat } from '@/lib/vessel-model'

// Reads the boat's own 3D file (migration 031) into a three.js object. The
// loaders are imported on demand, so they only ship to people whose project
// has a file. Kept apart from the scene so the parsing is one place to change
// when a new format is added.

// Draco-compressed GLBs need the decoder; the same CDN drei uses.
const DRACO_DECODERS = 'https://www.gstatic.com/draco/versioned/decoders/1.5.5/'

export async function parseVesselFile(buffer: ArrayBuffer, format: ModelFormat): Promise<THREE.Object3D> {
  if (format === 'glb') {
    const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/loaders/DRACOLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ])
    const draco = new DRACOLoader().setDecoderPath(DRACO_DECODERS)
    try {
      const gltf = await new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder).parseAsync(buffer, '')
      return gltf.scene
    } finally {
      draco.dispose()
    }
  }
  if (format === 'stl') {
    const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
    const geometry = new STLLoader().parse(buffer)
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    // STL carries no material: the drawing-office slate the drawn hull uses.
    return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#94a3b8', side: THREE.DoubleSide }))
  }
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
  return new OBJLoader().parse(new TextDecoder().decode(buffer))
}

/** The file's box in its own units and axes, before any alignment. */
export function rawBounds(object: THREE.Object3D): Bounds | null {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return null
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  }
}

const materialsOf = (o: THREE.Object3D): THREE.Material[] => {
  const m = (o as THREE.Mesh).material
  return !m ? [] : Array.isArray(m) ? m : [m]
}

/**
 * See-through, so the parts inside stay visible: the point of loading the
 * hull is to see where things sit in it, not to look at its paint.
 */
export function setOpacity(object: THREE.Object3D, opacity: number) {
  object.traverse((o) => {
    for (const m of materialsOf(o)) {
      m.transparent = opacity < 1
      m.opacity = opacity
      m.depthWrite = opacity >= 1
      m.side = THREE.DoubleSide
      m.needsUpdate = true
    }
  })
}

/** Frees the GPU memory a file took; models of yachts run to millions of triangles. */
export function disposeObject(object: THREE.Object3D) {
  object.traverse((o) => {
    ;(o as THREE.Mesh).geometry?.dispose()
    for (const m of materialsOf(o)) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
      m.dispose()
    }
  })
}

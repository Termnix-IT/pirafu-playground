// Makes the web copy of the 3D space: reads the GLB that Blender exported (prototypes/playground-3d) and writes
// a smaller one for the lobby. The source file is never changed.
//
//   - vertex data is stored as small integers (KHR_mesh_quantization), which three.js reads without a decoder.
//     Draco and Meshopt would be smaller still, but both need WebAssembly, which the portal's CSP forbids.
//   - identical data is shared, and the UV set that only the wood grain needs is dropped everywhere else.
//   - the one texture (the wood grain) is written as a file beside the model. Inside a GLB it is read through
//     a blob: URL, which the portal's CSP does not allow; as a file it is an ordinary image of the same origin.
//   - the curtain, the floor and the screens keep their plain float positions: the lobby's shaders and its
//     camera work in their local space (see src/space/room.js).
//
// usage: node scripts/optimize-space.mjs [source.glb] [target.glb]     (prepare-lobby.mjs calls this)
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize, weld } from '@gltf-transform/functions'

const here = path.dirname(fileURLToPath(import.meta.url))
const KEEP_FLOAT = /^(Curtain|Floor|Screen_)/

export async function optimizeSpace(source, target) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(source)
  const root = doc.getRoot()
  for (const node of root.listNodes()) node.setName(node.getName().replace(/\.\d+$/, ''))   // Blender's ".001" suffixes

  // Only materials with a texture read TEXCOORD_0; the second set carries the baked AO and is kept.
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial()
      const keepUV = KEEP_FLOAT.test(mesh.getName()) || material?.getBaseColorTexture() || material?.getNormalTexture()
      if (!keepUV && prim.getAttribute('TEXCOORD_0')) prim.setAttribute('TEXCOORD_0', null)
    }
  }

  const textures = root.listTextures()
  if (textures.length !== 1) throw new Error(`expected the wood grain as the only texture, found ${textures.length}: update optimize-space.mjs and src/space/room.js`)
  await writeFile(path.join(path.dirname(target), 'wood_ash.webp'), textures[0].getImage())
  for (const material of root.listMaterials()) material.setBaseColorTexture(null)
  for (const extension of root.listExtensionsUsed()) if (extension.extensionName === 'EXT_texture_webp') extension.dispose()

  // Remember the float data of the meshes that must stay in their own units, and put it back after quantizing.
  const kept = []
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh || !KEEP_FLOAT.test(node.getName())) continue
    kept.push({
      node, matrix: node.getMatrix(),
      prims: mesh.listPrimitives().map((prim) => ({
        prim,
        indices: prim.getIndices() ? prim.getIndices().getArray().slice() : null,
        attrs: prim.listSemantics().map((s) => { const a = prim.getAttribute(s); return [s, a.getType(), a.getArray().slice()] }),
      })),
    })
  }

  await doc.transform(
    dedup({ keepUniqueNames: true }),   // room.js finds materials by name, so two that look alike must stay two
    weld(),
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }),
  )
  for (const { node, matrix, prims } of kept) {
    node.setMatrix(matrix)
    for (const { prim, indices, attrs } of prims) {
      for (const [semantic, type, array] of attrs) prim.setAttribute(semantic, doc.createAccessor().setType(type).setArray(array))
      if (indices) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices))
    }
  }
  await doc.transform(prune({ keepAttributes: true, keepLeaves: true }))   // the Light_* nodes are empty on purpose

  await io.write(target, doc)
  const [before, after] = await Promise.all([stat(source), stat(target)])
  const gz = async (file) => zlib.gzipSync(await readFile(file)).length
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`
  console.log(`space model: ${kb(before.size)} -> ${kb(after.size)} (gzip ${kb(await gz(source))} -> ${kb(await gz(target))})`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2] ?? path.resolve(here, '..', '..', 'playground-3d', 'public', 'assets', 'playground.glb')
  const target = process.argv[3] ?? path.resolve(here, '..', 'public', 'assets', 'space.glb')
  await optimizeSpace(source, target)
}

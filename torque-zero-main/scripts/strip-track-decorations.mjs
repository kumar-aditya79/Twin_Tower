import fs from "node:fs"

const [, , inputPath, outputPath] = process.argv
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/strip-track-decorations.mjs <input.glb> <output.glb>")
}

const source = fs.readFileSync(inputPath)
if (source.toString("utf8", 0, 4) !== "glTF") throw new Error("Input is not a binary glTF")

const jsonLength = source.readUInt32LE(12)
const jsonType = source.readUInt32LE(16)
if (jsonType !== 0x4e4f534a) throw new Error("First GLB chunk is not JSON")

const document = JSON.parse(source.subarray(20, 20 + jsonLength).toString("utf8"))
const shouldRemove = (name = "") => name.endsWith("_garages_0") || name.endsWith("_trees_0")

const removeIndices = new Set(
  (document.nodes ?? [])
    .map((node, nodeIndex) => shouldRemove(node.name) ? nodeIndex : -1)
    .filter((nodeIndex) => nodeIndex >= 0),
)

for (const node of document.nodes ?? []) {
  if (node.children) node.children = node.children.filter((nodeIndex) => !removeIndices.has(nodeIndex))
}
for (const scene of document.scenes ?? []) {
  scene.nodes = (scene.nodes ?? []).filter((nodeIndex) => !removeIndices.has(nodeIndex))
}

const json = Buffer.from(JSON.stringify(document), "utf8")
const jsonPadding = (4 - (json.length % 4)) % 4
const paddedJson = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)])
const remainingChunks = source.subarray(20 + jsonLength)
const totalLength = 12 + 8 + paddedJson.length + remainingChunks.length
const header = Buffer.alloc(20)
header.write("glTF", 0, 4, "ascii")
header.writeUInt32LE(2, 4)
header.writeUInt32LE(totalLength, 8)
header.writeUInt32LE(paddedJson.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)

fs.writeFileSync(outputPath, Buffer.concat([header, paddedJson, remainingChunks]))

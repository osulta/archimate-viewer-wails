import fs from 'node:fs/promises'
import path from 'node:path'
import { DOMParser as LinkedomDOMParser } from 'linkedom'

globalThis.DOMParser = LinkedomDOMParser

const { parseSplitModel } = await import('../src/lib/archimate/parsing/split-files/parse-split-model.js')

const modelRoot = process.argv[2] || path.join(process.env.HOME, 'Temp/sync/model')
const manifest = await fs.readFile(path.join(modelRoot, 'folder.xml'), 'utf8')

async function collectFiles(dir, prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full, rel)))
    } else if (entry.isFile() && entry.name.endsWith('.xml')) {
      const content = await fs.readFile(full, 'utf8')
      files.push({ relativePath: rel, content })
    }
  }
  return files
}

const files = await collectFiles(modelRoot)
const started = Date.now()
const model = parseSplitModel({
  modelRoot: 'model',
  manifestPath: 'model/folder.xml',
  manifest,
  files,
})
const ms = Date.now() - started

console.log(
  JSON.stringify(
    {
      modelName: model.modelName,
      format: model.format,
      elements: model.elements.length,
      relationships: model.relationships.length,
      diagrams: model.diagrams.length,
      parseMs: ms,
      sampleDiagram: model.diagrams[0]?.name,
      sampleElement: model.elements[0]?.name,
    },
    null,
    2,
  ),
)

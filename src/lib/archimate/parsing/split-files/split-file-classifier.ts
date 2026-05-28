export type SplitFileCategory = 'manifest' | 'folder' | 'element' | 'relationship' | 'diagram'

export function classifySplitModelFile(relativePath: string, rootLocalName: string): SplitFileCategory {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const segments = normalized.split('/').filter(Boolean)
  const fileName = segments.at(-1) ?? normalized

  if (fileName === 'folder.xml') {
    return segments.length <= 1 ? 'manifest' : 'folder'
  }

  if (segments[0] === 'relations') {
    return 'relationship'
  }

  if (segments[0] === 'diagrams') {
    return rootLocalName === 'ArchimateDiagramModel' ? 'diagram' : 'folder'
  }

  return 'element'
}

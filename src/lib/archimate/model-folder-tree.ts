import type { TreeSelectProps } from 'antd'
import type { ParsedElement, ParsedRelationship, ParsedDiagram } from '../../types/model'

export type DiagramTreeSelectNode = NonNullable<TreeSelectProps['treeData']>[number]

export type ModelTreeItemKind = 'element' | 'relationship' | 'diagram'

export interface ModelFolderNode {
  key: string
  name: string
  folderType?: string
  folders: ModelFolderNode[]
  elements?: ParsedElement[]
  relationships?: ParsedRelationship[]
  diagrams?: ParsedDiagram[]
}

export function filterModelFolderTree(
  folders: ModelFolderNode[],
  matchesItem: (item: ParsedElement | ParsedRelationship | ParsedDiagram, kind: ModelTreeItemKind) => boolean,
): ModelFolderNode[] {
  if (!folders?.length) {
    return []
  }

  const result: ModelFolderNode[] = []

  for (const folder of folders) {
    const childFolders = filterModelFolderTree(folder.folders ?? [], matchesItem)
    const elements = (folder.elements ?? []).filter((item) => matchesItem(item, 'element'))
    const relationships = (folder.relationships ?? []).filter((item) =>
      matchesItem(item, 'relationship'),
    )
    const diagrams = (folder.diagrams ?? []).filter((item) => matchesItem(item, 'diagram'))

    if (
      childFolders.length > 0 ||
      elements.length > 0 ||
      relationships.length > 0 ||
      diagrams.length > 0
    ) {
      result.push({
        ...folder,
        folders: childFolders,
        elements,
        relationships,
        diagrams,
      })
    }
  }

  return result
}

export function countItemsInFolderTree(folders: ModelFolderNode[], kind: ModelTreeItemKind): number {
  let count = 0
  for (const folder of folders ?? []) {
    if (kind === 'element') {
      count += folder.elements?.length ?? 0
    } else if (kind === 'relationship') {
      count += folder.relationships?.length ?? 0
    } else {
      count += folder.diagrams?.length ?? 0
    }
    count += countItemsInFolderTree(folder.folders, kind)
  }
  return count
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function sortModelFolderNodes(folders: ModelFolderNode[]): ModelFolderNode[] {
  return [...(folders ?? [])]
    .sort((a, b) => compareNames(a.name, b.name))
    .map((folder) => ({
      ...folder,
      folders: sortModelFolderNodes(folder.folders ?? []),
      diagrams: [...(folder.diagrams ?? [])].sort((a, b) =>
        compareNames(a.name ?? '', b.name ?? ''),
      ),
      elements: [...(folder.elements ?? [])].sort((a, b) =>
        compareNames(a.name ?? '', b.name ?? ''),
      ),
      relationships: [...(folder.relationships ?? [])].sort((a, b) =>
        compareNames(a.name ?? a.id ?? '', b.name ?? b.id ?? ''),
      ),
    }))
}

export function formatArchimateTypeLabel(type: string): string {
  if (!type) {
    return ''
  }
  const local = type.includes(':') ? type.split(':').pop()! : type
  return local.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function getDiagramTreePathParts(folderPath: string | undefined): string[] {
  const parts = (folderPath ?? '')
    .split(' / ')
    .map((segment) => segment.trim())
    .filter(Boolean)

  return parts.length > 0 ? parts.slice(1) : []
}

export function buildDiagramFolderTree(diagrams: ParsedDiagram[]): {
  folders: ModelFolderNode[]
  rootDiagrams: ParsedDiagram[]
} {
  const folders: ModelFolderNode[] = []
  const rootDiagrams: ParsedDiagram[] = []

  for (const diagram of diagrams ?? []) {
    const parts = getDiagramTreePathParts(diagram.folderPath)

    if (parts.length === 0) {
      rootDiagrams.push(diagram)
      continue
    }

    let currentLevel = folders
    let pathKey = ''

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      pathKey = pathKey ? `${pathKey}/${part}` : part

      let folder = currentLevel.find((entry) => entry.name === part)
      if (!folder) {
        folder = {
          key: `diagram-folder:${pathKey}`,
          name: part,
          folderType: index === 0 ? 'diagrams' : '',
          folders: [],
          elements: [],
          relationships: [],
          diagrams: [],
        }
        currentLevel.push(folder)
      }

      if (index === parts.length - 1) {
        folder.diagrams!.push(diagram)
      } else {
        currentLevel = folder.folders
      }
    }
  }

  return {
    folders: sortModelFolderNodes(folders),
    rootDiagrams: rootDiagrams.sort((a, b) => compareNames(a.name ?? '', b.name ?? '')),
  }
}

function diagramTreeSelectTitle(diagram: ParsedDiagram): string {
  return diagram.folderPath ? `${diagram.folderPath} / ${diagram.name}` : diagram.name
}

function folderNodesToTreeSelectData(folders: ModelFolderNode[]): DiagramTreeSelectNode[] {
  return folders.map((folder) => {
    const children: DiagramTreeSelectNode[] = [
      ...folderNodesToTreeSelectData(folder.folders ?? []),
      ...(folder.diagrams ?? []).map((diagram) => ({
        value: diagram.id,
        title: diagramTreeSelectTitle(diagram),
      })),
    ]
    return {
      value: folder.key,
      title: folder.name,
      selectable: false,
      children: children.length > 0 ? children : undefined,
    }
  })
}

/** Builds Ant Design TreeSelect data for diagram pickers (folder tree + search by name/path). */
export function buildDiagramTreeSelectData(diagrams: ParsedDiagram[]): DiagramTreeSelectNode[] {
  const { folders, rootDiagrams } = buildDiagramFolderTree(diagrams)
  return [
    ...folderNodesToTreeSelectData(folders),
    ...rootDiagrams.map((diagram) => ({
      value: diagram.id,
      title: diagramTreeSelectTitle(diagram),
    })),
  ]
}

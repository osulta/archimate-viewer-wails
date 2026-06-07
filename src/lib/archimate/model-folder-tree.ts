import type { TreeDataNode, TreeSelectProps } from 'antd'
import type { ParsedElement, ParsedRelationship, ParsedDiagram } from '../../types/model'
import { decodeXmlEntities } from './xml-utils'

export type DiagramTreeSelectNode = NonNullable<TreeSelectProps['treeData']>[number]

export interface DiagramSidebarTreeNode extends TreeDataNode {
  key: string
  title: string
  tooltip?: string
  diagramId?: string
  children?: DiagramSidebarTreeNode[]
}

export interface ElementSidebarTreeNode extends TreeDataNode {
  key: string
  title: string
  tooltip?: string
  elementId?: string
  elementType?: string
  children?: ElementSidebarTreeNode[]
}

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
  const parts = splitFolderPath(folderPath)
  return parts.length > 0 ? parts.slice(1) : []
}

export function getElementTreePathParts(folderPath: string | undefined): string[] {
  return splitFolderPath(folderPath)
}

function splitFolderPath(folderPath: string | undefined): string[] {
  return decodeXmlEntities(folderPath)
    .split(' / ')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function buildItemFolderTree<T extends { folderPath?: string }>(
  items: T[],
  getPathParts: (folderPath: string | undefined) => string[],
  folderKeyPrefix: string,
  placeItem: (folder: ModelFolderNode, item: T) => void,
): { folders: ModelFolderNode[]; rootItems: T[] } {
  const folders: ModelFolderNode[] = []
  const rootItems: T[] = []

  for (const item of items ?? []) {
    const parts = getPathParts(item.folderPath)

    if (parts.length === 0) {
      rootItems.push(item)
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
          key: `${folderKeyPrefix}:${pathKey}`,
          name: part,
          folderType: index === 0 ? folderKeyPrefix : '',
          folders: [],
          elements: [],
          relationships: [],
          diagrams: [],
        }
        currentLevel.push(folder)
      }

      if (index === parts.length - 1) {
        placeItem(folder, item)
      } else {
        currentLevel = folder.folders
      }
    }
  }

  return { folders, rootItems }
}

export function buildDiagramFolderTree(diagrams: ParsedDiagram[]): {
  folders: ModelFolderNode[]
  rootDiagrams: ParsedDiagram[]
} {
  const { folders, rootItems } = buildItemFolderTree(
    diagrams,
    getDiagramTreePathParts,
    'diagram-folder',
    (folder, diagram) => {
      folder.diagrams!.push(diagram)
    },
  )

  return {
    folders: sortModelFolderNodes(folders),
    rootDiagrams: rootItems.sort((a, b) => compareNames(a.name ?? '', b.name ?? '')),
  }
}

export function buildElementFolderTree(elements: ParsedElement[]): {
  folders: ModelFolderNode[]
  rootElements: ParsedElement[]
} {
  const { folders, rootItems } = buildItemFolderTree(
    elements,
    getElementTreePathParts,
    'element-folder',
    (folder, element) => {
      folder.elements!.push(element)
    },
  )

  return {
    folders: sortModelFolderNodes(folders),
    rootElements: rootItems.sort((a, b) => compareNames(a.name ?? '', b.name ?? '')),
  }
}

export function elementTreeDisplayTitle(element: ParsedElement): string {
  const name = decodeXmlEntities(element.name || element.id)
  const folderPath = decodeXmlEntities(element.folderPath)
  return folderPath ? `${folderPath} / ${name}` : name
}

export function diagramTreeDisplayTitle(diagram: ParsedDiagram): string {
  const name = decodeXmlEntities(diagram.name)
  const folderPath = decodeXmlEntities(diagram.folderPath)
  return folderPath ? `${folderPath} / ${name}` : name
}

function diagramTreeSelectTitle(diagram: ParsedDiagram): string {
  return diagramTreeDisplayTitle(diagram)
}

function diagramToSidebarTreeNode(diagram: ParsedDiagram): DiagramSidebarTreeNode {
  return {
    key: diagram.id,
    title: decodeXmlEntities(diagram.name || diagram.id),
    tooltip: diagramTreeDisplayTitle(diagram),
    diagramId: diagram.id,
    isLeaf: true,
    selectable: true,
  }
}

function folderNodesToSidebarTreeData(folders: ModelFolderNode[]): DiagramSidebarTreeNode[] {
  return folders.map((folder) => {
    const children: DiagramSidebarTreeNode[] = [
      ...folderNodesToSidebarTreeData(folder.folders ?? []),
      ...(folder.diagrams ?? []).map(diagramToSidebarTreeNode),
    ]
    return {
      key: folder.key,
      title: folder.name,
      tooltip: folder.name,
      selectable: false,
      children: children.length > 0 ? children : undefined,
    }
  })
}

/** Builds Ant Design Tree data for the sidebar diagram section. */
export function buildDiagramSidebarTreeData(
  folders: ModelFolderNode[],
  rootDiagrams: ParsedDiagram[],
): DiagramSidebarTreeNode[] {
  return [
    ...folderNodesToSidebarTreeData(folders),
    ...rootDiagrams.map(diagramToSidebarTreeNode),
  ]
}

export function collectDiagramFolderKeys(nodes: DiagramSidebarTreeNode[]): string[] {
  return collectSidebarFolderKeys(nodes)
}

function elementToSidebarTreeNode(element: ParsedElement): ElementSidebarTreeNode {
  return {
    key: element.id,
    title: decodeXmlEntities(element.name || element.id),
    tooltip: elementTreeDisplayTitle(element),
    elementId: element.id,
    elementType: element.type,
    isLeaf: true,
    selectable: true,
  }
}

function folderNodesToElementSidebarTreeData(folders: ModelFolderNode[]): ElementSidebarTreeNode[] {
  return folders.map((folder) => {
    const children: ElementSidebarTreeNode[] = [
      ...folderNodesToElementSidebarTreeData(folder.folders ?? []),
      ...(folder.elements ?? []).map(elementToSidebarTreeNode),
    ]
    return {
      key: folder.key,
      title: folder.name,
      tooltip: folder.name,
      selectable: false,
      children: children.length > 0 ? children : undefined,
    }
  })
}

/** Builds Ant Design Tree data for the sidebar element section. */
export function buildElementSidebarTreeData(
  folders: ModelFolderNode[],
  rootElements: ParsedElement[],
): ElementSidebarTreeNode[] {
  return [
    ...folderNodesToElementSidebarTreeData(folders),
    ...rootElements.map(elementToSidebarTreeNode),
  ]
}

export function collectElementFolderKeys(nodes: ElementSidebarTreeNode[]): string[] {
  return collectSidebarFolderKeys(nodes)
}

function collectSidebarFolderKeys(nodes: Array<{ key: string | number; children?: unknown[] }>): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.children?.length) {
      keys.push(String(node.key))
      keys.push(
        ...collectSidebarFolderKeys(
          node.children as Array<{ key: string | number; children?: unknown[] }>,
        ),
      )
    }
  }
  return keys
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

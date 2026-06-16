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

export function getDiagramTreePathParts(
  folderPath: string | undefined,
  branchName = 'Views',
): string[] {
  const parts = splitFolderPath(folderPath)
  if (!parts.length) {
    return []
  }
  if (parts[0] === branchName) {
    return parts.slice(1)
  }
  return parts
}

export function normalizeDiagramFolderFullPath(
  folderPath: string | undefined,
  branchName: string,
): string {
  const parts = splitFolderPath(folderPath)
  if (!parts.length) {
    return branchName
  }
  if (parts[0] === branchName) {
    return parts.join(' / ')
  }
  return `${branchName} / ${parts.join(' / ')}`
}

export function getDiagramFolderDisplayName(folderPath: string, branchName: string): string {
  const parts = splitFolderPath(normalizeDiagramFolderFullPath(folderPath, branchName))
  return parts.at(-1) ?? 'Folder'
}

export function splitFolderPath(folderPath: string | undefined): string[] {
  return decodeXmlEntities(folderPath)
    .split(' / ')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

export function inferDiagramsBranchName(
  diagrams: ParsedDiagram[],
  diagramFolderPaths: Iterable<string> = [],
): string {
  for (const diagram of diagrams) {
    const parts = splitFolderPath(diagram.folderPath)
    if (parts.length > 0) {
      return parts[0]
    }
  }
  for (const path of diagramFolderPaths) {
    const parts = splitFolderPath(path)
    if (parts.length > 0) {
      return parts[0]
    }
  }
  return 'Views'
}

export function diagramFolderKeyFromPathParts(relativeParts: string[]): string {
  return relativeParts.length ? `diagram-folder:${relativeParts.join('/')}` : ''
}

export function resolveDiagramFolderPathFromKey(
  folderKey: string,
  branchName: string,
): string {
  if (!folderKey.startsWith('diagram-folder:')) {
    return ''
  }
  const relative = folderKey.slice('diagram-folder:'.length).trim()
  if (!relative) {
    return branchName
  }
  return `${branchName} / ${relative.split('/').join(' / ')}`
}

export function resolveDiagramParentFolderKey(
  diagram: ParsedDiagram,
  branchName: string,
): string {
  const parts = getDiagramTreePathParts(diagram.folderPath, branchName)
  if (!parts.length) {
    return ''
  }
  return diagramFolderKeyFromPathParts(parts)
}

export interface SelectedDiagramFolderInfo {
  key: string
  name: string
  fullPath: string
  parentPath: string
  directDiagramCount: number
  directSubfolderCount: number
  totalDiagramCount: number
  diagrams: ParsedDiagram[]
}

export function findDiagramFolderNodeByKey(
  folders: ModelFolderNode[],
  folderKey: string,
): ModelFolderNode | null {
  for (const folder of folders ?? []) {
    if (folder.key === folderKey) {
      return folder
    }
    const nested = findDiagramFolderNodeByKey(folder.folders ?? [], folderKey)
    if (nested) {
      return nested
    }
  }
  return null
}

export function inferDiagramFolderIdsFromModel(
  model: {
    diagrams: ParsedDiagram[]
    diagramFolderPaths?: string[]
    diagramFolderIds?: Record<string, string>
    diagramFolderSourceFiles?: Record<string, string>
  },
  branchName: string,
): {
  diagramFolderIds: Record<string, string>
  diagramFolderSourceFiles: Record<string, string>
} {
  const diagramFolderIds = { ...(model.diagramFolderIds ?? {}) }
  const diagramFolderSourceFiles = { ...(model.diagramFolderSourceFiles ?? {}) }

  for (const [folderPath, sourceFile] of Object.entries(diagramFolderSourceFiles)) {
    if (!diagramFolderIds[folderPath]) {
      const dir = sourceFile.replace(/\/folder\.xml$/i, '')
      const folderId = dir.split('/').pop()
      if (folderId) {
        diagramFolderIds[folderPath] = folderId
      }
    }
  }

  for (const diagram of model.diagrams) {
    const sourceFile = diagram.sourceFile
    const folderPath = diagram.folderPath?.trim()
    if (!sourceFile?.startsWith('diagrams/') || !folderPath) {
      continue
    }
    const normalizedPath = normalizeDiagramFolderFullPath(folderPath, branchName)
    const dirParts = sourceFile
      .slice(0, sourceFile.lastIndexOf('/'))
      .replace(/^diagrams\/?/, '')
      .split('/')
      .filter(Boolean)
    const pathParts = splitFolderPath(normalizedPath)
    const relativeParts = pathParts[0] === branchName ? pathParts.slice(1) : pathParts
    for (let index = 0; index < relativeParts.length; index += 1) {
      const currentPath = [branchName, ...relativeParts.slice(0, index + 1)].join(' / ')
      const folderId = dirParts[index]
      if (!folderId) {
        continue
      }
      if (!diagramFolderIds[currentPath]) {
        diagramFolderIds[currentPath] = folderId
      }
      if (!diagramFolderSourceFiles[currentPath]) {
        diagramFolderSourceFiles[currentPath] =
          `diagrams/${dirParts.slice(0, index + 1).join('/')}/folder.xml`
      }
    }
  }

  for (const folderPath of model.diagramFolderPaths ?? []) {
    const normalizedPath = normalizeDiagramFolderFullPath(folderPath, branchName)
    if (diagramFolderIds[normalizedPath] && !diagramFolderSourceFiles[normalizedPath]) {
      const pathParts = splitFolderPath(normalizedPath)
      const relativeParts = pathParts[0] === branchName ? pathParts.slice(1) : pathParts
      const idSegments = relativeParts.map((_, index) => {
        const currentPath = [branchName, ...relativeParts.slice(0, index + 1)].join(' / ')
        return diagramFolderIds[currentPath]
      })
      if (idSegments.every(Boolean)) {
        diagramFolderSourceFiles[normalizedPath] =
          `diagrams/${idSegments.join('/')}/folder.xml`
      }
    }
  }

  return { diagramFolderIds, diagramFolderSourceFiles }
}

export function remapDiagramFolderFullPath(
  oldFullPath: string,
  newFullPath: string,
  path: string,
): string {
  if (path === oldFullPath) {
    return newFullPath
  }
  const prefix = `${oldFullPath} / `
  if (path.startsWith(prefix)) {
    return `${newFullPath} / ${path.slice(prefix.length)}`
  }
  return path
}

export function buildRenamedDiagramFolderFullPath(
  oldFullPath: string,
  newFolderName: string,
): string {
  const parts = splitFolderPath(oldFullPath)
  const trimmed = String(newFolderName ?? '').trim()
  if (!parts.length || !trimmed) {
    return oldFullPath
  }
  return [...parts.slice(0, -1), trimmed].join(' / ')
}

export function resolveSelectedDiagramFolderInfo(
  model: { diagrams: ParsedDiagram[]; diagramFolderPaths?: string[] },
  folderKey: string,
): SelectedDiagramFolderInfo | null {
  if (!folderKey.startsWith('diagram-folder:')) {
    return null
  }
  const branchName = inferDiagramsBranchName(model.diagrams, model.diagramFolderPaths ?? [])
  const fullPath = resolveDiagramFolderPathFromKey(folderKey, branchName)
  const parts = splitFolderPath(fullPath)
  if (!parts.length) {
    return null
  }
  const name = parts.at(-1) ?? ''
  const parentPath = parts.length > 1 ? parts.slice(0, -1).join(' / ') : branchName
  const { folders } = buildDiagramFolderTree(model.diagrams, model.diagramFolderPaths ?? [])
  const folderNode = findDiagramFolderNodeByKey(folders, folderKey)
  const directDiagrams = folderNode?.diagrams ?? []
  const directSubfolderCount = folderNode?.folders?.length ?? 0
  const pathPrefix = `${fullPath} / `
  const totalDiagramCount = model.diagrams.filter((diagram) => {
    const folderPath = diagram.folderPath?.trim()
    return folderPath === fullPath || Boolean(folderPath?.startsWith(pathPrefix))
  }).length

  return {
    key: folderKey,
    name,
    fullPath,
    parentPath,
    directDiagramCount: directDiagrams.length,
    directSubfolderCount,
    totalDiagramCount,
    diagrams: [...directDiagrams].sort((a, b) =>
      compareNames(a.name ?? '', b.name ?? ''),
    ),
  }
}

function insertDiagramFolderPathIntoTree(
  folders: ModelFolderNode[],
  fullFolderPath: string,
  branchName: string,
): void {
  const parts = splitFolderPath(fullFolderPath)
  const relativeParts = parts[0] === branchName ? parts.slice(1) : parts
  if (!relativeParts.length) {
    return
  }

  let currentLevel = folders
  let pathKey = ''

  for (let index = 0; index < relativeParts.length; index += 1) {
    const part = relativeParts[index]
    pathKey = pathKey ? `${pathKey}/${part}` : part

    let folder = currentLevel.find((entry) => entry.name === part)
    if (!folder) {
      folder = {
        key: diagramFolderKeyFromPathParts(relativeParts.slice(0, index + 1)),
        name: part,
        folderType: index === 0 ? 'diagram-folder' : '',
        folders: [],
        diagrams: [],
      }
      currentLevel.push(folder)
    }

    currentLevel = folder.folders
  }
}

function dedupeFolderPaths(paths: Iterable<string>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const path of paths) {
    const normalized = String(path ?? '').trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

export function getElementTreePathParts(folderPath: string | undefined): string[] {
  return splitFolderPath(folderPath)
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

export function buildDiagramFolderTree(
  diagrams: ParsedDiagram[],
  extraFolderPaths: Iterable<string> = [],
): {
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

  const branchName = inferDiagramsBranchName(diagrams, extraFolderPaths)
  for (const folderPath of dedupeFolderPaths(extraFolderPaths)) {
    insertDiagramFolderPathIntoTree(folders, folderPath, branchName)
  }

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
      selectable: true,
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

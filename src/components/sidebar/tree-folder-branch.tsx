import React from 'react'
import { formatArchimateTypeLabel } from '../../lib/archimate/model-folder-tree'
import type { ParsedElement, ParsedRelationship, ParsedDiagram, DiagramNode, ElementOverride } from '../../types/model'

interface ModelFolderNode {
  key: string
  name: string
  folderType?: string
  folders: ModelFolderNode[]
  elements?: ParsedElement[]
  relationships?: ParsedRelationship[]
  diagrams?: ParsedDiagram[]
}

function hasFolderContent(folder: ModelFolderNode): boolean {
  return (
    (folder.folders?.length ?? 0) > 0 ||
    (folder.elements?.length ?? 0) > 0 ||
    (folder.relationships?.length ?? 0) > 0 ||
    (folder.diagrams?.length ?? 0) > 0
  )
}

interface TreeFolderBranchProps {
  folder: ModelFolderNode
  depth?: number
  elementOverrides: Map<string, ElementOverride>
  selectedElementId: string | null
  selectedRelationshipRef: string | null
  selectedDiagramId: string | null
  onSelectElement: (
    id: string,
    context: { diagramId: string; node?: DiagramNode } | null,
  ) => void
  onSelectRelationship: (id: string, diagramId: string | null) => void
  onSelectDiagram: (id: string) => void
  findDiagramForElement?: (elementId: string) => { diagramId: string; node: DiagramNode } | null
  findDiagramForRelationship?: (relationshipId: string) => string | null
}

export function TreeFolderBranch({
  folder,
  depth = 0,
  elementOverrides,
  selectedElementId,
  selectedRelationshipRef,
  selectedDiagramId,
  onSelectElement,
  onSelectRelationship,
  onSelectDiagram,
  findDiagramForElement,
  findDiagramForRelationship,
}: TreeFolderBranchProps): React.JSX.Element | null {
  if (!hasFolderContent(folder)) {
    return null
  }

  const childFolders = folder.folders ?? []
  const elements = folder.elements ?? []
  const relationships = folder.relationships ?? []
  const diagrams = folder.diagrams ?? []

  return (
    <li className="tree-folder">
      <details open={depth < 2}>
        <summary className="tree-folder-summary">{folder.name}</summary>
        <ul>
          {childFolders.map((child) => (
            <TreeFolderBranch
              key={child.key}
              folder={child}
              depth={depth + 1}
              elementOverrides={elementOverrides}
              selectedElementId={selectedElementId}
              selectedRelationshipRef={selectedRelationshipRef}
              selectedDiagramId={selectedDiagramId}
              onSelectElement={onSelectElement}
              onSelectRelationship={onSelectRelationship}
              onSelectDiagram={onSelectDiagram}
              findDiagramForElement={findDiagramForElement}
              findDiagramForRelationship={findDiagramForRelationship}
            />
          ))}
          {elements.map((item) => (
            <li key={item.id} title={`${item.type} (${item.id})`}>
              <button
                type="button"
                className={selectedElementId === item.id ? 'tree-btn selected' : 'tree-btn'}
                onClick={() => onSelectElement(item.id, findDiagramForElement?.(item.id) ?? null)}
              >
                <span className="node-label">
                  {elementOverrides.get(item.id)?.name ?? item.name}
                </span>
                <span className="node-type">{formatArchimateTypeLabel(item.type)}</span>
              </button>
            </li>
          ))}
          {relationships.map((item) => (
            <li key={item.id} title={`${item.source} → ${item.target}`}>
              <button
                type="button"
                className={
                  selectedRelationshipRef === item.id ? 'tree-btn selected' : 'tree-btn'
                }
                onClick={() =>
                  onSelectRelationship(item.id, findDiagramForRelationship?.(item.id) ?? null)
                }
              >
                <span className="node-label">{item.name || item.id}</span>
                <span className="node-type">{formatArchimateTypeLabel(item.type)}</span>
              </button>
            </li>
          ))}
          {diagrams.map((diagram) => (
            <li key={diagram.id}>
              <button
                type="button"
                className={
                  selectedDiagramId === diagram.id ? 'diagram-btn active' : 'diagram-btn'
                }
                onClick={() => onSelectDiagram(diagram.id)}
              >
                {diagram.name}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

interface TreeSectionProps {
  title: string
  totalCount: number
  visibleCount: number
  treeSearchNorm: string
  folders: ModelFolderNode[]
  rootDiagrams?: ParsedDiagram[]
  emptyMessage: string
  selectedDiagramId: string | null
  onSelectDiagram: (id: string) => void
  onCreateDiagram?: () => void
  elementOverrides: Map<string, ElementOverride>
  selectedElementId: string | null
  selectedRelationshipRef: string | null
  onSelectElement: (
    id: string,
    context: { diagramId: string; node?: DiagramNode } | null,
  ) => void
  onSelectRelationship: (id: string, diagramId: string | null) => void
  findDiagramForElement?: (elementId: string) => { diagramId: string; node: DiagramNode } | null
  findDiagramForRelationship?: (relationshipId: string) => string | null
}

export function TreeSection({
  title,
  totalCount,
  visibleCount,
  treeSearchNorm,
  folders,
  rootDiagrams = [],
  emptyMessage,
  selectedDiagramId,
  onSelectDiagram,
  onCreateDiagram,
  elementOverrides,
  selectedElementId,
  selectedRelationshipRef,
  onSelectElement,
  onSelectRelationship,
  findDiagramForElement,
  findDiagramForRelationship,
}: TreeSectionProps): React.JSX.Element {
  const countLabel = treeSearchNorm ? `${visibleCount} / ${totalCount}` : totalCount
  const hasContent = folders.length > 0 || rootDiagrams.length > 0

  function handleCreateDiagramClick(event: React.MouseEvent<HTMLButtonElement>): void {
    event.preventDefault()
    event.stopPropagation()
    onCreateDiagram?.()
  }

  return (
    <details open>
      <summary className="tree-section-summary">
        <span className="tree-section-summary-label">
          {title} ({countLabel})
        </span>
        {onCreateDiagram ? (
          <button
            type="button"
            className="tree-section-add-btn"
            title="Создать диаграмму"
            aria-label="Создать диаграмму"
            onClick={handleCreateDiagramClick}
          >
            +
          </button>
        ) : null}
      </summary>
      {!hasContent ? (
        <p className="tree-search-empty">{emptyMessage}</p>
      ) : (
        <ul className="tree-section-root">
          {folders.map((folder) => (
            <TreeFolderBranch
              key={folder.key}
              folder={folder}
              elementOverrides={elementOverrides}
              selectedElementId={selectedElementId}
              selectedRelationshipRef={selectedRelationshipRef}
              selectedDiagramId={selectedDiagramId}
              onSelectElement={onSelectElement}
              onSelectRelationship={onSelectRelationship}
              onSelectDiagram={onSelectDiagram}
              findDiagramForElement={findDiagramForElement}
              findDiagramForRelationship={findDiagramForRelationship}
            />
          ))}
          {rootDiagrams.map((diagram) => (
            <li key={diagram.id}>
              <button
                type="button"
                className={
                  selectedDiagramId === diagram.id ? 'diagram-btn active' : 'diagram-btn'
                }
                onClick={() => onSelectDiagram(diagram.id)}
              >
                {diagram.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

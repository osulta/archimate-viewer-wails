import React from 'react'
import { Button, Collapse } from 'antd'
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
      <Collapse
        className="tree-collapse"
        defaultActiveKey={depth < 2 ? [folder.key] : []}
        items={[
          {
            key: folder.key,
            label: folder.name,
            children: (
              <ul className="tree-list">
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
                    <Button
                      type={selectedElementId === item.id ? 'primary' : 'text'}
                      ghost={selectedElementId === item.id}
                      className="tree-btn"
                      onClick={() => onSelectElement(item.id, findDiagramForElement?.(item.id) ?? null)}
                    >
                      <span className="node-label">
                        {elementOverrides.get(item.id)?.name ?? item.name}
                      </span>
                      <span className="node-type">{formatArchimateTypeLabel(item.type)}</span>
                    </Button>
                  </li>
                ))}
                {relationships.map((item) => (
                  <li key={item.id} title={`${item.source} → ${item.target}`}>
                    <Button
                      type={selectedRelationshipRef === item.id ? 'primary' : 'text'}
                      ghost={selectedRelationshipRef === item.id}
                      className="tree-btn"
                      onClick={() =>
                        onSelectRelationship(item.id, findDiagramForRelationship?.(item.id) ?? null)
                      }
                    >
                      <span className="node-label">{item.name || item.id}</span>
                      <span className="node-type">{formatArchimateTypeLabel(item.type)}</span>
                    </Button>
                  </li>
                ))}
                {diagrams.map((diagram) => (
                  <li key={diagram.id}>
                    <Button
                      type={selectedDiagramId === diagram.id ? 'primary' : 'default'}
                      ghost={selectedDiagramId === diagram.id}
                      block
                      className="diagram-btn"
                      onClick={() => onSelectDiagram(diagram.id)}
                    >
                      {diagram.name}
                    </Button>
                  </li>
                ))}
              </ul>
            ),
          },
        ]}
      />
    </li>
  )
}

interface TreeSectionProps {
  treeSearchNorm: string
  folders: ModelFolderNode[]
  rootDiagrams?: ParsedDiagram[]
  emptyMessage: string
  selectedDiagramId: string | null
  onSelectDiagram: (id: string) => void
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
  folders,
  rootDiagrams = [],
  emptyMessage,
  selectedDiagramId,
  onSelectDiagram,
  elementOverrides,
  selectedElementId,
  selectedRelationshipRef,
  onSelectElement,
  onSelectRelationship,
  findDiagramForElement,
  findDiagramForRelationship,
}: TreeSectionProps): React.JSX.Element {
  const hasContent = folders.length > 0 || rootDiagrams.length > 0

  if (!hasContent) {
    return <p className="tree-search-empty">{emptyMessage}</p>
  }

  return (
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
          <Button
            type={selectedDiagramId === diagram.id ? 'primary' : 'default'}
            ghost={selectedDiagramId === diagram.id}
            block
            className="diagram-btn"
            onClick={() => onSelectDiagram(diagram.id)}
          >
            {diagram.name}
          </Button>
        </li>
      ))}
    </ul>
  )
}

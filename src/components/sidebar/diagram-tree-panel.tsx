import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Tree } from 'antd'
import { FileOutlined, FolderOutlined } from '@ant-design/icons'
import type { Key } from 'antd/es/table/interface'
import { setSidebarDiagramDragData } from '../../lib/archimate/sidebar-drag'
import {
  buildDiagramSidebarTreeData,
  collectDiagramFolderKeys,
  type DiagramSidebarTreeNode,
  type ModelFolderNode,
} from '../../lib/archimate/model-folder-tree'
import type { ParsedDiagram } from '../../types/model'

interface DiagramTreePanelProps {
  folders: ModelFolderNode[]
  rootDiagrams: ParsedDiagram[]
  selectedDiagramId: string | null
  treeSearchActive: boolean
  emptyMessage: string
  searchTruncated?: boolean
  searchTotalMatches?: number
  searchVisibleCount?: number
  allowDiagramDrag?: boolean
  onSelectDiagram: (diagramId: string) => void
}

function withTreeIcons(nodes: DiagramSidebarTreeNode[]): DiagramSidebarTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    icon: node.diagramId ? <FileOutlined /> : <FolderOutlined />,
    children: node.children ? withTreeIcons(node.children) : undefined,
  }))
}

export function DiagramTreePanel({
  folders,
  rootDiagrams,
  selectedDiagramId,
  treeSearchActive,
  emptyMessage,
  searchTruncated = false,
  searchTotalMatches = 0,
  searchVisibleCount = 0,
  allowDiagramDrag = false,
  onSelectDiagram,
}: DiagramTreePanelProps): React.JSX.Element {
  const treeData = useMemo(
    () => withTreeIcons(buildDiagramSidebarTreeData(folders, rootDiagrams)),
    [folders, rootDiagrams],
  )

  const [expandedKeys, setExpandedKeys] = useState<Key[]>([])

  useEffect(() => {
    if (treeSearchActive) {
      setExpandedKeys(collectDiagramFolderKeys(treeData))
    }
  }, [treeSearchActive, treeData])

  const handleSelect = useCallback(
    (_keys: Key[], info: { node: DiagramSidebarTreeNode }) => {
      if (info.node.diagramId) {
        onSelectDiagram(info.node.diagramId)
      }
    },
    [onSelectDiagram],
  )

  const renderTitle = useCallback(
    (node: DiagramSidebarTreeNode) => {
      const title = String(node.title ?? '')
      const tooltip = node.tooltip ?? title

      if (!node.diagramId) {
        return (
          <span className="diagram-tree-folder-title" title={tooltip}>
            {title}
          </span>
        )
      }

      const dragTitle = allowDiagramDrag
        ? `${tooltip} — перетащите на диаграмму как ссылку`
        : tooltip

      return (
        <span
          className={
            allowDiagramDrag
              ? 'diagram-tree-leaf-title is-draggable'
              : 'diagram-tree-leaf-title'
          }
          title={dragTitle}
          draggable={allowDiagramDrag}
          onDragStart={(event) => {
            if (!node.diagramId) {
              return
            }
            setSidebarDiagramDragData(event.dataTransfer, node.diagramId)
            event.currentTarget.classList.add('is-dragging')
          }}
          onDragEnd={(event) => {
            event.currentTarget.classList.remove('is-dragging')
          }}
        >
          {title}
        </span>
      )
    },
    [allowDiagramDrag],
  )

  if (treeData.length === 0) {
    return <p className="tree-search-empty">{emptyMessage}</p>
  }

  return (
    <>
      {searchTruncated ? (
        <p className="tree-hint-compact">
          Показаны первые {searchVisibleCount.toLocaleString()} из{' '}
          {searchTotalMatches.toLocaleString()}. Уточните запрос.
        </p>
      ) : null}
      <Tree
      className="diagram-tree"
      blockNode
      showLine
      treeData={treeData}
      selectedKeys={selectedDiagramId ? [selectedDiagramId] : []}
      expandedKeys={expandedKeys}
      onExpand={setExpandedKeys}
      onSelect={handleSelect}
      titleRender={renderTitle}
    />
    </>
  )
}

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Tree } from 'antd'
import { FileOutlined, FolderOutlined } from '@ant-design/icons'
import type { Key } from 'antd/es/table/interface'
import { setSidebarElementDragData } from '../../lib/archimate/sidebar-drag'
import {
  buildElementSidebarTreeData,
  collectElementFolderKeys,
  formatArchimateTypeLabel,
  type ElementSidebarTreeNode,
  type ModelFolderNode,
} from '../../lib/archimate/model-folder-tree'
import type { ElementOverride, ParsedElement } from '../../types/model'

interface ElementTreePanelProps {
  folders: ModelFolderNode[]
  rootElements: ParsedElement[]
  elementOverrides: Map<string, ElementOverride>
  selectedElementId: string | null
  treeSearchNorm: string
  emptyMessage: string
  allowElementDrag?: boolean
  onSelectElement: (elementId: string) => void
}

function withTreeIcons(nodes: ElementSidebarTreeNode[]): ElementSidebarTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    icon: node.elementId ? <FileOutlined /> : <FolderOutlined />,
    children: node.children ? withTreeIcons(node.children) : undefined,
  }))
}

export function ElementTreePanel({
  folders,
  rootElements,
  elementOverrides,
  selectedElementId,
  treeSearchNorm,
  emptyMessage,
  allowElementDrag = false,
  onSelectElement,
}: ElementTreePanelProps): React.JSX.Element {
  const treeData = useMemo(
    () => withTreeIcons(buildElementSidebarTreeData(folders, rootElements)),
    [folders, rootElements],
  )

  const [expandedKeys, setExpandedKeys] = useState<Key[]>([])

  useEffect(() => {
    if (treeSearchNorm) {
      setExpandedKeys(collectElementFolderKeys(treeData))
    }
  }, [treeSearchNorm, treeData])

  const handleSelect = useCallback(
    (_keys: Key[], info: { node: ElementSidebarTreeNode }) => {
      if (info.node.elementId) {
        onSelectElement(info.node.elementId)
      }
    },
    [onSelectElement],
  )

  const renderTitle = useCallback(
    (node: ElementSidebarTreeNode) => {
      const tooltip = node.tooltip ?? String(node.title ?? '')

      if (!node.elementId) {
        return (
          <span className="element-tree-folder-title" title={tooltip}>
            {String(node.title ?? '')}
          </span>
        )
      }

      const displayName = elementOverrides.get(node.elementId)?.name ?? String(node.title ?? '')
      const typeLabel = formatArchimateTypeLabel(node.elementType ?? '')
      const dragTitle = allowElementDrag
        ? `${tooltip} (${typeLabel}) — перетащите на диаграмму`
        : `${tooltip} (${typeLabel})`

      return (
        <span
          className={
            allowElementDrag
              ? 'element-tree-leaf-title is-draggable'
              : 'element-tree-leaf-title'
          }
          title={dragTitle}
          draggable={allowElementDrag}
          onDragStart={(event) => {
            if (!node.elementId) {
              return
            }
            setSidebarElementDragData(event.dataTransfer, node.elementId)
            event.currentTarget.classList.add('is-dragging')
          }}
          onDragEnd={(event) => {
            event.currentTarget.classList.remove('is-dragging')
          }}
        >
          <span className="element-tree-leaf-name">{displayName}</span>
          <span className="element-tree-leaf-type">{typeLabel}</span>
        </span>
      )
    },
    [allowElementDrag, elementOverrides],
  )

  if (treeData.length === 0) {
    return <p className="tree-search-empty">{emptyMessage}</p>
  }

  return (
    <Tree
      className="element-tree"
      blockNode
      showLine
      treeData={treeData}
      selectedKeys={selectedElementId ? [selectedElementId] : []}
      expandedKeys={expandedKeys}
      onExpand={setExpandedKeys}
      onSelect={handleSelect}
      titleRender={renderTitle}
    />
  )
}

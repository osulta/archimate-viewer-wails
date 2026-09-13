import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Tree } from 'antd'
import { FileOutlined, FolderOutlined } from '@ant-design/icons'
import type { Key } from 'antd/es/table/interface'
import type { EventDataNode } from 'antd/es/tree'
import { setSidebarElementDragData } from '../../lib/archimate/sidebar-drag'
import {
  buildElementFolderChildrenTreeData,
  buildElementSidebarTreeData,
  buildLazyElementSidebarTreeData,
  collectElementFolderKeys,
  formatArchimateTypeLabel,
  updateElementSidebarTreeChildren,
  type ElementSidebarTreeNode,
  type ModelFolderNode,
} from '../../lib/archimate/model-folder-tree'
import type { ElementOverride, ParsedElement } from '../../types/model'

interface ElementTreePanelProps {
  folders: ModelFolderNode[]
  rootElements: ParsedElement[]
  elementOverrides: Map<string, ElementOverride>
  selectedElementId: string | null
  treeSearchActive: boolean
  emptyMessage: string
  allowElementDrag?: boolean
  onSelectElement: (elementId: string) => void
}

export function ElementTreePanel({
  folders,
  rootElements,
  elementOverrides,
  selectedElementId,
  treeSearchActive,
  emptyMessage,
  allowElementDrag = false,
  onSelectElement,
}: ElementTreePanelProps): React.JSX.Element {
  const eagerTreeData = useMemo(() => {
    if (!treeSearchActive) {
      return null
    }
    return buildElementSidebarTreeData(folders, rootElements)
  }, [treeSearchActive, folders, rootElements])

  const [lazyTreeData, setLazyTreeData] = useState<ElementSidebarTreeNode[]>(() =>
    buildLazyElementSidebarTreeData(folders, rootElements),
  )

  useEffect(() => {
    if (treeSearchActive) {
      return
    }
    setLazyTreeData(buildLazyElementSidebarTreeData(folders, rootElements))
  }, [treeSearchActive, folders, rootElements])

  const treeData = treeSearchActive ? (eagerTreeData ?? []) : lazyTreeData

  const [expandedKeys, setExpandedKeys] = useState<Key[]>([])

  useEffect(() => {
    if (treeSearchActive && eagerTreeData) {
      setExpandedKeys(collectElementFolderKeys(eagerTreeData))
      return
    }
    setExpandedKeys([])
  }, [treeSearchActive, eagerTreeData])

  const handleLoadData = useCallback(
    async (treeNode: EventDataNode<ElementSidebarTreeNode>) => {
      if (treeSearchActive) {
        return
      }
      const folderKey = String(treeNode.key)
      if (treeNode.children?.length) {
        return
      }
      const children = buildElementFolderChildrenTreeData(folders, rootElements, folderKey)
      if (!children) {
        return
      }
      setLazyTreeData((current) => updateElementSidebarTreeChildren(current, folderKey, children))
    },
    [treeSearchActive, folders, rootElements],
  )

  const handleSelect = useCallback(
    (_keys: Key[], info: { node: ElementSidebarTreeNode }) => {
      if (info.node.elementId) {
        onSelectElement(info.node.elementId)
      }
    },
    [onSelectElement],
  )

  const renderIcon = useCallback((props: { isLeaf?: boolean }) => {
    return props.isLeaf ? <FileOutlined /> : <FolderOutlined />
  }, [])

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
      loadData={treeSearchActive ? undefined : handleLoadData}
      onSelect={handleSelect}
      icon={renderIcon}
      titleRender={renderTitle}
    />
  )
}

/** MIME type for dragging a model element from the sidebar tree onto the diagram canvas. */
export const SIDEBAR_ELEMENT_DRAG_TYPE = 'application/x-archimate-element-id'

/** MIME type for dragging a new element type from the palette onto the diagram canvas. */
export const SIDEBAR_NEW_ELEMENT_TYPE_DRAG = 'application/x-archimate-new-element-type'

export function setSidebarElementDragData(dataTransfer: DataTransfer, elementId: string): void {
  dataTransfer.setData(SIDEBAR_ELEMENT_DRAG_TYPE, elementId)
  dataTransfer.effectAllowed = 'copy'
}

export function getSidebarElementDragId(dataTransfer: DataTransfer): string | null {
  const id = dataTransfer.getData(SIDEBAR_ELEMENT_DRAG_TYPE)
  return id?.trim() ? id.trim() : null
}

export function hasSidebarElementDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(SIDEBAR_ELEMENT_DRAG_TYPE)
}

export function setSidebarNewElementDragData(dataTransfer: DataTransfer, elementType: string): void {
  dataTransfer.setData(SIDEBAR_NEW_ELEMENT_TYPE_DRAG, elementType)
  dataTransfer.effectAllowed = 'copy'
}

export function getSidebarNewElementDragType(dataTransfer: DataTransfer): string | null {
  const type = dataTransfer.getData(SIDEBAR_NEW_ELEMENT_TYPE_DRAG)
  return type?.trim() ? type.trim() : null
}

export function hasSidebarNewElementDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(SIDEBAR_NEW_ELEMENT_TYPE_DRAG)
}

/** MIME type for dragging a new relationship type from the palette onto the diagram canvas. */
export const SIDEBAR_NEW_RELATIONSHIP_TYPE_DRAG = 'application/x-archimate-new-relationship-type'

export function setSidebarNewRelationshipDragData(dataTransfer: DataTransfer, relationshipType: string): void {
  dataTransfer.setData(SIDEBAR_NEW_RELATIONSHIP_TYPE_DRAG, relationshipType)
  dataTransfer.effectAllowed = 'copy'
}

export function getSidebarNewRelationshipDragType(dataTransfer: DataTransfer): string | null {
  const type = dataTransfer.getData(SIDEBAR_NEW_RELATIONSHIP_TYPE_DRAG)
  return type?.trim() ? type.trim() : null
}

export function hasSidebarNewRelationshipDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(SIDEBAR_NEW_RELATIONSHIP_TYPE_DRAG)
}

export function hasSidebarDiagramDrop(dataTransfer: DataTransfer): boolean {
  return (
    hasSidebarElementDrag(dataTransfer) ||
    hasSidebarNewElementDrag(dataTransfer) ||
    hasSidebarNewRelationshipDrag(dataTransfer)
  )
}

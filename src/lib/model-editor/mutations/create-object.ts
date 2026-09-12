import { generateArchimateModelId } from '../../archimate/model-id'
import {
  flattenNodes,
  applyOverridesToNodes,
  findInnermostContainingNode,
  insertNodeUnderParent,
  snapToGrid,
} from '../../archimate/diagram-model'
import type {
  ParsedElement,
  DiagramNode,
  CreatedRelationship,
  CreatedObject,
  ParsedModel,
  Point,
  DiagramOverridesMap,
} from '../../../types/model'
import { applyNestAggregationToDiagrams } from './layout'

function resolvePlacementPoint(
  nodes: DiagramNode[],
  atPoint: Point | null | undefined,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  const flat = flattenNodes(nodes)
  const maxY = flat.length ? Math.max(...flat.map((n) => n.y + n.height)) : 40
  const maxX = flat.length ? Math.max(...flat.map((n) => n.x)) : 40
  const x = snapToGrid(
    atPoint && Number.isFinite(atPoint.x)
      ? Math.max(0, atPoint.x - offsetX)
      : Math.max(40, Math.min(260, maxX + 30)),
  )
  const y = snapToGrid(
    atPoint && Number.isFinite(atPoint.y) ? Math.max(0, atPoint.y - offsetY) : maxY + 30,
  )
  return { x, y }
}

function layoutNodesForPlacement(
  nodes: DiagramNode[],
  diagramId: string,
  diagramOverrides: DiagramOverridesMap,
): DiagramNode[] {
  const diagramOverridesForDiagram = diagramOverrides.get(diagramId)
  return diagramOverridesForDiagram?.size
    ? applyOverridesToNodes(nodes, diagramOverridesForDiagram)
    : nodes
}

export interface CreateNewObjectResult {
  nextModel: ParsedModel
  newNode: DiagramNode
  newElement: ParsedElement
  createdObject: CreatedObject
  createdRelationship?: CreatedRelationship
  elementId: string
}

export function computeCreateNewObject(
  model: ParsedModel,
  selectedDiagramId: string,
  elementType: string,
  atPoint: Point | null,
  nameOverride: string,
  diagramOverrides: DiagramOverridesMap,
): CreateNewObjectResult | null {
  const type =
    String(elementType ?? 'BusinessProcess')
      .trim()
      .replace(/^archimate:/i, '') || 'BusinessProcess'
  const name = String(nameOverride ?? '').trim() || `New ${type}`
  const elementId = generateArchimateModelId()
  const nodeId = generateArchimateModelId()

  const targetDiagram = model.diagrams.find((d) => d.id === selectedDiagramId)
  if (!targetDiagram) {
    return null
  }

  const { x: targetX, y: targetY } = resolvePlacementPoint(targetDiagram.nodes, atPoint, 85, 35)
  const newNode: DiagramNode = {
    id: nodeId,
    elementRef: elementId,
    type: 'DiagramObject',
    label: '',
    x: targetX,
    y: targetY,
    width: 170,
    height: 70,
    children: [],
  }

  const layoutNodes = layoutNodesForPlacement(targetDiagram.nodes, selectedDiagramId, diagramOverrides)
  const containerNode = findInnermostContainingNode(layoutNodes, newNode)

  const newElement: ParsedElement = {
    id: elementId,
    name,
    type: `archimate:${type}`,
    documentation: '',
    properties: [],
  }

  const nextDiagrams = model.diagrams.map((diagram) => {
    if (diagram.id !== selectedDiagramId) {
      return diagram
    }
    return {
      ...diagram,
      nodes: containerNode
        ? insertNodeUnderParent(diagram.nodes, containerNode.id, newNode)
        : [...diagram.nodes, newNode],
    }
  })

  const nextElements = [...model.elements, newElement]
  const nextElementById = new Map(model.elementById)
  nextElementById.set(elementId, newElement)

  let finalDiagrams = nextDiagrams
  let finalRelationships = model.relationships
  let finalRelationshipById = model.relationshipById
  let createdRelationship: CreatedRelationship | undefined

  if (containerNode) {
    const aggregationResult = applyNestAggregationToDiagrams(
      model,
      selectedDiagramId,
      nextDiagrams,
      containerNode.id,
      nodeId,
    )
    if (aggregationResult) {
      finalDiagrams = aggregationResult.diagrams
      finalRelationships = aggregationResult.relationships
      finalRelationshipById = aggregationResult.relationshipById
      createdRelationship = aggregationResult.createdRelationship
    }
  }

  return {
    nextModel: {
      ...model,
      elements: nextElements,
      diagrams: finalDiagrams,
      elementById: nextElementById,
      relationships: finalRelationships,
      relationshipById: finalRelationshipById,
    },
    newNode,
    newElement,
    createdObject: {
      diagramId: selectedDiagramId,
      element: newElement,
      node: newNode,
      format: model.format,
    },
    createdRelationship,
    elementId,
  }
}

export interface PlaceElementResult {
  nextModel: ParsedModel
  newNode: DiagramNode
  createdObject: CreatedObject
  createdRelationship?: CreatedRelationship
  elementId: string
}

export function computePlaceElementOnDiagram(
  model: ParsedModel,
  selectedDiagramId: string,
  elementId: string,
  atPoint: Point,
  diagramOverrides: DiagramOverridesMap,
): PlaceElementResult | null {
  const element = model.elementById.get(elementId)
  if (!element) {
    return null
  }

  const targetDiagram = model.diagrams.find((d) => d.id === selectedDiagramId)
  if (!targetDiagram) {
    return null
  }

  const nodeId = generateArchimateModelId()
  const { x: targetX, y: targetY } = resolvePlacementPoint(targetDiagram.nodes, atPoint, 85, 35)
  const newNode: DiagramNode = {
    id: nodeId,
    elementRef: elementId,
    type: 'DiagramObject',
    label: '',
    x: targetX,
    y: targetY,
    width: 170,
    height: 70,
    children: [],
  }

  const layoutNodes = layoutNodesForPlacement(targetDiagram.nodes, selectedDiagramId, diagramOverrides)
  const containerNode = findInnermostContainingNode(layoutNodes, newNode)

  const nextDiagrams = model.diagrams.map((diagram) => {
    if (diagram.id !== selectedDiagramId) {
      return diagram
    }
    return {
      ...diagram,
      nodes: containerNode
        ? insertNodeUnderParent(diagram.nodes, containerNode.id, newNode)
        : [...diagram.nodes, newNode],
    }
  })

  let finalDiagrams = nextDiagrams
  let finalRelationships = model.relationships
  let finalRelationshipById = model.relationshipById
  let createdRelationship: CreatedRelationship | undefined

  if (containerNode) {
    const aggregationResult = applyNestAggregationToDiagrams(
      model,
      selectedDiagramId,
      nextDiagrams,
      containerNode.id,
      nodeId,
    )
    if (aggregationResult) {
      finalDiagrams = aggregationResult.diagrams
      finalRelationships = aggregationResult.relationships
      finalRelationshipById = aggregationResult.relationshipById
      createdRelationship = aggregationResult.createdRelationship
    }
  }

  return {
    nextModel: {
      ...model,
      diagrams: finalDiagrams,
      relationships: finalRelationships,
      relationshipById: finalRelationshipById,
    },
    newNode,
    createdObject: {
      diagramId: selectedDiagramId,
      element,
      node: newNode,
      format: model.format,
      existingElement: true,
    },
    createdRelationship,
    elementId,
  }
}

export interface PlaceDiagramReferenceResult {
  nextModel: ParsedModel
  newNode: DiagramNode
}

export function computePlaceDiagramReferenceOnDiagram(
  model: ParsedModel,
  selectedDiagramId: string,
  referencedDiagramId: string,
  atPoint: Point,
  diagramOverrides: DiagramOverridesMap,
): PlaceDiagramReferenceResult | null {
  if (referencedDiagramId === selectedDiagramId) {
    return null
  }
  const referencedDiagram = model.diagrams.find((item) => item.id === referencedDiagramId)
  if (!referencedDiagram) {
    return null
  }

  const targetDiagram = model.diagrams.find((item) => item.id === selectedDiagramId)
  if (!targetDiagram) {
    return null
  }

  const nodeId = generateArchimateModelId()
  const { x: targetX, y: targetY } = resolvePlacementPoint(targetDiagram.nodes, atPoint, 78, 12)
  const newNode: DiagramNode = {
    id: nodeId,
    elementRef: '',
    type: 'archimate:DiagramModelReference',
    label: referencedDiagram.name,
    referencedDiagramId,
    x: targetX,
    y: targetY,
    width: 157,
    height: 25,
    children: [],
  }

  const layoutNodes = layoutNodesForPlacement(targetDiagram.nodes, selectedDiagramId, diagramOverrides)
  const containerNode = findInnermostContainingNode(layoutNodes, newNode)

  const nextDiagrams = model.diagrams.map((diagram) => {
    if (diagram.id !== selectedDiagramId) {
      return diagram
    }
    return {
      ...diagram,
      nodes: containerNode
        ? insertNodeUnderParent(diagram.nodes, containerNode.id, newNode)
        : [...diagram.nodes, newNode],
    }
  })

  return {
    nextModel: {
      ...model,
      diagrams: nextDiagrams,
    },
    newNode,
  }
}

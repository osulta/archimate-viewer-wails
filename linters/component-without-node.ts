import { flattenNodes } from '../src/lib/archimate/diagram-model'
import type { ParsedModel } from '../src/types/model'
import type { LinterDefinition, LinterFinding } from './linter-types'

function typeSuffix(type: string | undefined): string {
  if (!type) {
    return ''
  }
  const raw = String(type)
  return raw.includes(':') ? raw.split(':').at(-1) ?? raw : raw
}

function isApplicationComponent(element: { type?: string } | undefined): boolean {
  return typeSuffix(element?.type) === 'ApplicationComponent'
}

function isNode(element: { type?: string } | undefined): boolean {
  return typeSuffix(element?.type) === 'Node'
}

export const componentWithoutNodeLinter: LinterDefinition = {
  id: 'component-without-node',
  title: 'Application Component без Node',
  description:
    'Находит компоненты приложения (Application Component), размещённые на диаграммах, у которых нет связи в модели ни с одним объектом Node.',
  run(model: ParsedModel | null) {
    if (!model) {
      return {
        ok: false,
        message: 'Модель не загружена.',
        findings: [],
      }
    }

    const elementById =
      model.elementById ??
      new Map((model.elements ?? []).map((el) => [el.id, el]))

    const onDiagramElementIds = new Set<string>()
    for (const diagram of model.diagrams ?? []) {
      for (const node of flattenNodes(diagram.nodes ?? [])) {
        const ref = node.elementRef?.trim()
        if (ref) {
          onDiagramElementIds.add(ref)
        }
      }
    }

    const linkedToNodeIds = new Set<string>()
    for (const rel of model.relationships ?? []) {
      const src = rel.source ? elementById.get(rel.source) : undefined
      const tgt = rel.target ? elementById.get(rel.target) : undefined
      if (!src || !tgt) {
        continue
      }
      if (isApplicationComponent(src) && isNode(tgt)) {
        linkedToNodeIds.add(src.id)
      }
      if (isNode(src) && isApplicationComponent(tgt)) {
        linkedToNodeIds.add(tgt.id)
      }
    }

    const findings: LinterFinding[] = (model.elements ?? [])
      .filter(
        (element) =>
          isApplicationComponent(element) &&
          onDiagramElementIds.has(element.id) &&
          !linkedToNodeIds.has(element.id),
      )
      .map((element) => ({
        elementId: element.id,
        name: element.name || element.id,
        type: element.type || 'ApplicationComponent',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    if (findings.length === 0) {
      return {
        ok: true,
        message:
          'Все Application Component на диаграммах связаны хотя бы с одним Node в модели.',
        findings: [],
      }
    }

    return {
      ok: true,
      message: `Найдено компонентов на схеме без связи с Node: ${findings.length}.`,
      findings,
    }
  },
}

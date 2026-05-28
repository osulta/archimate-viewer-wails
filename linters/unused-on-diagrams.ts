import { flattenNodes } from '../src/lib/archimate/diagram-model'
import type { ParsedModel } from '../src/types/model'
import type { LinterDefinition, LinterFinding } from './linter-types'

export const unusedOnDiagramsLinter: LinterDefinition = {
  id: 'unused-on-diagrams',
  title: 'Объекты вне диаграмм',
  description:
    'Находит элементы ArchiMate, которые есть в модели, но не отображаются ни на одной диаграмме.',
  run(model: ParsedModel | null) {
    if (!model) {
      return {
        ok: false,
        message: 'Модель не загружена.',
        findings: [],
      }
    }

    const usedElementRefs = new Set<string>()
    for (const diagram of model.diagrams ?? []) {
      for (const node of flattenNodes(diagram.nodes ?? [])) {
        const ref = node.elementRef?.trim()
        if (ref) {
          usedElementRefs.add(ref)
        }
      }
    }

    const findings: LinterFinding[] = (model.elements ?? [])
      .filter((element) => !usedElementRefs.has(element.id))
      .map((element) => ({
        elementId: element.id,
        name: element.name || element.id,
        type: element.type || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    if (findings.length === 0) {
      return {
        ok: true,
        message: 'Все элементы модели используются хотя бы на одной диаграмме.',
        findings: [],
      }
    }

    return {
      ok: true,
      message: `Найдено объектов вне диаграмм: ${findings.length}.`,
      findings,
    }
  },
}

import type { ParsedModel } from '../src/types/model'
import type { LinterDefinition, LinterFinding } from './linter-types'

export const unlinkedElementsLinter: LinterDefinition = {
  id: 'unlinked-elements',
  title: 'Объекты без связей',
  description:
    'Находит элементы ArchiMate, у которых нет ни одной связи в модели (не указаны как source или target).',
  run(model: ParsedModel | null) {
    if (!model) {
      return {
        ok: false,
        message: 'Модель не загружена.',
        findings: [],
      }
    }

    const connectedElementIds = new Set<string>()
    for (const rel of model.relationships ?? []) {
      if (rel.source) {
        connectedElementIds.add(rel.source)
      }
      if (rel.target) {
        connectedElementIds.add(rel.target)
      }
    }

    const findings: LinterFinding[] = (model.elements ?? [])
      .filter((element) => !connectedElementIds.has(element.id))
      .map((element) => ({
        elementId: element.id,
        name: element.name || element.id,
        type: element.type || '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    if (findings.length === 0) {
      return {
        ok: true,
        message: 'Все элементы модели участвуют хотя бы в одной связи.',
        findings: [],
      }
    }

    return {
      ok: true,
      message: `Найдено объектов без связей: ${findings.length}.`,
      findings,
    }
  },
}

import type { ParsedModel } from '../src/types/model'
import type { LinterDefinition, LinterFinding } from './linter-types'

function typeSuffix(type: string | undefined): string {
  if (!type) {
    return ''
  }
  const raw = String(type)
  return raw.includes(':') ? raw.split(':').at(-1) ?? raw : raw
}

export const componentFunctionAssignmentsLinter: LinterDefinition = {
  id: 'component-function-assignments',
  title: 'Assignment: компонент → функция',
  description:
    'Перечисляет связи ArchiMate типа Assignment от элемента Application Component к элементу Application Function.',
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

    const findings: LinterFinding[] = []

    for (const rel of model.relationships ?? []) {
      if (typeSuffix(rel.type) !== 'AssignmentRelationship') {
        continue
      }
      const src = rel.source ? elementById.get(rel.source) : undefined
      const tgt = rel.target ? elementById.get(rel.target) : undefined
      if (!src || !tgt) {
        continue
      }
      if (typeSuffix(src.type) !== 'ApplicationComponent') {
        continue
      }
      if (typeSuffix(tgt.type) !== 'ApplicationFunction') {
        continue
      }

      const sourceName = src.name || src.id
      const targetName = tgt.name || tgt.id
      findings.push({
        elementId: rel.id,
        name: `${sourceName} → ${targetName}`,
        type: 'ApplicationComponent → ApplicationFunction',
      })
    }

    findings.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    if (findings.length === 0) {
      return {
        ok: true,
        message: 'Таких связей Assignment в модели нет.',
        findings: [],
        findingsStyle: 'neutral',
      }
    }

    return {
      ok: true,
      message: `Найдено связей Assignment (компонент → функция): ${findings.length}.`,
      findings,
      findingsStyle: 'neutral',
    }
  },
}

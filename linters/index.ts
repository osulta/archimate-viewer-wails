import { componentFunctionAssignmentsLinter } from './component-function-assignments'
import { componentWithoutNodeLinter } from './component-without-node'
import { unlinkedElementsLinter } from './unlinked-elements'
import { unusedOnDiagramsLinter } from './unused-on-diagrams'
import type { LinterDefinition } from './linter-types'

export type { LinterDefinition, LinterFinding, LinterRunResult } from './linter-types'

export const linters: LinterDefinition[] = [
  componentFunctionAssignmentsLinter,
  componentWithoutNodeLinter,
  unlinkedElementsLinter,
  unusedOnDiagramsLinter,
]

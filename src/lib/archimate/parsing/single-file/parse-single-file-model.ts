import type { ParsedModel } from '../../../../types/model'
import { getDirectChildrenByTag } from '../../xml-utils'
import { parseXmlDocument } from '../xml/parse-xml-document'
import { parseArchiToolFormat } from './archi-tool-format-parser'
import { parseExchangeFormat } from './exchange-format-parser'

export function parseSingleFileModel(xmlText: string): ParsedModel {
  const documentNode = parseXmlDocument(xmlText)

  const modelNode = Array.from(documentNode.getElementsByTagName('*')).find(
    (item) => item.localName === 'model',
  )
  if (!modelNode) {
    throw new Error('Не найден узел <model> в файле ArchiMate.')
  }

  const hasFolder = getDirectChildrenByTag(modelNode, 'folder').length > 0
  if (hasFolder) {
    return parseArchiToolFormat(modelNode)
  }

  return parseExchangeFormat(modelNode)
}

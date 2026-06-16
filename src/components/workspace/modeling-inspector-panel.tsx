import { Empty } from 'antd'
import { ObjectPropertiesPanel } from '../object-properties-panel'
import type { ComponentProps } from 'react'

type ObjectPropertiesPanelProps = ComponentProps<typeof ObjectPropertiesPanel>

interface ModelingInspectorPanelProps extends ObjectPropertiesPanelProps {
  hasSelection: boolean
}

export function ModelingInspectorPanel({
  hasSelection,
  ...propertiesProps
}: ModelingInspectorPanelProps) {
  if (!hasSelection) {
    return (
      <Empty
        className="props-empty"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Выберите диаграмму, папку, объект или связь, чтобы увидеть свойства."
      />
    )
  }

  return <ObjectPropertiesPanel {...propertiesProps} />
}

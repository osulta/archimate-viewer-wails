import { Button, Empty, InputNumber, Space } from 'antd'
import { ZoomInOutlined, ZoomOutOutlined, DownloadOutlined } from '@ant-design/icons'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_WHEEL_FACTOR } from '../../lib/diagram-canvas'
import type { DiagramCanvasProps } from '../../lib/diagram-canvas'
import { useDiagramCanvas } from './use-diagram-canvas'
import { DiagramCanvasContextMenu } from './diagram-canvas-context-menu'

export function DiagramCanvas(props: DiagramCanvasProps) {
  const {
    diagram,
    canvasRef,
    zoom,
    isDragging,
    isPanning,
    isElementDropTarget,
    handleScrollContainerRef,
    setZoomClamped,
    handleExportPng,
    handleCanvasClick,
    handleAuxClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleCanvasDoubleClick,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    startPanView,
    contextMenu,
    closeContextMenu,
    handleContextMenu,
  } = useDiagramCanvas(props)

  if (!diagram) {
    return (
      <div className="placeholder">
        <Empty description="Выберите диаграмму в дереве объектов слева." />
      </div>
    )
  }

  return (
    <div
      className={
        isElementDropTarget ? 'canvas-wrap is-element-drop-target' : 'canvas-wrap'
      }
    >
      <div className="canvas-toolbar">
        <Space size={6}>
          <Button
            size="small"
            icon={<ZoomInOutlined />}
            title="Увеличить"
            onClick={() => setZoomClamped(zoom * ZOOM_WHEEL_FACTOR)}
          />
          <Button
            size="small"
            icon={<ZoomOutOutlined />}
            title="Уменьшить"
            onClick={() => setZoomClamped(zoom / ZOOM_WHEEL_FACTOR)}
          />
          <Button size="small" onClick={() => setZoomClamped(1)}>
            100%
          </Button>
          <span className="canvas-zoom-label">
            <span className="canvas-zoom-label-text">Зум</span>
            <InputNumber
              className="canvas-zoom-input"
              size="small"
              min={Math.round(ZOOM_MIN * 100)}
              max={Math.round(ZOOM_MAX * 100)}
              step={10}
              value={Math.round(zoom * 100)}
              onChange={(value) => {
                if (typeof value === 'number' && Number.isFinite(value)) {
                  setZoomClamped(value / 100)
                }
              }}
              aria-label="Масштаб диаграммы в процентах"
            />
            <span className="canvas-zoom-suffix">%</span>
          </span>
        </Space>
        <Button
          size="small"
          type="primary"
          ghost
          className="canvas-export-btn"
          icon={<DownloadOutlined />}
          title="Сохранить диаграмму как PNG (полное разрешение canvas)"
          onClick={handleExportPng}
        >
          PNG
        </Button>
      </div>
      <div
        className={
          isPanning ? 'canvas-scroll is-panning' : 'canvas-scroll'
        }
        ref={handleScrollContainerRef}
        onPointerDown={startPanView}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <canvas
          ref={canvasRef}
          className={isDragging ? 'diagram-canvas is-dragging' : 'diagram-canvas'}
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
          onClick={handleCanvasClick}
          onAuxClick={handleAuxClick}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onDoubleClick={handleCanvasDoubleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      </div>
      <DiagramCanvasContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        items={contextMenu?.items}
        onClose={closeContextMenu}
      />
    </div>
  )
}

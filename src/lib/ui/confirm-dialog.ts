import { Modal } from 'antd'

interface ConfirmDialogOptions {
  title?: string
  content: string
  okText?: string
  cancelText?: string
  danger?: boolean
}

/**
 * In-DOM confirmation that works in both the browser and the Wails desktop
 * webview. Native `window.confirm` is disabled by WKWebView on macOS, so any
 * destructive action must use this instead of `window.confirm`.
 */
export function confirmDialog({
  title = 'Подтверждение',
  content,
  okText = 'OK',
  cancelText = 'Отмена',
  danger = false,
}: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title,
      content,
      okText,
      cancelText,
      okButtonProps: danger ? { danger: true } : undefined,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}

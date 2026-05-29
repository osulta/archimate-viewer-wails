import { Spin } from 'antd'

interface GitCommandLoaderProps {
  active: boolean
  label?: string
}

export function GitCommandLoader({ active, label }: GitCommandLoaderProps) {
  if (!active) {
    return null
  }
  return (
    <div className="git-command-loader" aria-live="polite">
      <Spin />
      {label ? <span className="git-loader-label">{label}</span> : null}
    </div>
  )
}

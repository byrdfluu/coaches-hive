import type { ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export default function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`rounded-2xl border border-[#dcdcdc] bg-white p-4 text-sm text-[#4a4a4a] ${className || ''}`}>
      <p className="text-sm font-semibold text-[#191919]">{title}</p>
      {description ? <p className="mt-1 text-xs text-[#4a4a4a]">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

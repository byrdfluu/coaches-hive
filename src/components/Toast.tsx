'use client'

import { useEffect } from 'react'

type ToastProps = {
  message: string
  onClose: () => void
  actionLabel?: string
  onAction?: () => void
  durationMs?: number
}

export default function Toast({ message, onClose, actionLabel, onAction, durationMs = 2500 }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => onClose(), durationMs)
    return () => clearTimeout(timer)
  }, [message, onClose, durationMs])

  if (!message) return null

  return (
    <div className="fixed bottom-6 right-6 z-[999] flex items-center gap-3 rounded-full border border-[#191919] bg-white px-4 py-2 text-xs font-semibold text-[#191919] shadow-lg">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={() => {
            onAction()
          }}
          className="rounded-full border border-[#191919] px-2 py-0.5 text-[11px] font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

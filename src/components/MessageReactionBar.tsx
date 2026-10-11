'use client'

import { useState } from 'react'

export type MessageReaction = { emoji: string; count: number; reacted: boolean }
const choices = ['👍','❤️','😂','😮','😢','👏']

export default function MessageReactionBar({ messageId, reactions, onChange }: {
  messageId: string
  reactions: MessageReaction[]
  onChange: (reactions: MessageReaction[]) => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const toggle = async (emoji: string) => {
    const existing = reactions.find((reaction) => reaction.emoji === emoji)
    setSaving(emoji)
    try {
      const response = await fetch(`/api/messages/${messageId}/reactions`, {
        method: existing?.reacted ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : payload?.error?.message || 'Unable to change reaction')
      onChange(Array.isArray(payload.reactions) ? payload.reactions : [])
    } finally { setSaving(null) }
  }

  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Message reactions">
      {reactions.map((reaction) => (
        <button key={reaction.emoji} type="button" disabled={saving !== null} onClick={() => toggle(reaction.emoji)}
          className={`rounded-full border px-2 py-0.5 text-xs ${reaction.reacted ? 'border-[#b80f0a] bg-[#fff1f0]' : 'border-[#dcdcdc] bg-white'}`}
          aria-pressed={reaction.reacted} aria-label={`${reaction.emoji} reaction, ${reaction.count}`}>
          {reaction.emoji} {reaction.count}
        </button>
      ))}
      <div className="group/reactions relative">
        <button type="button" className="rounded-full border border-[#dcdcdc] bg-white px-2 py-0.5 text-xs" aria-label="Add reaction">＋</button>
        <div className="invisible absolute bottom-full z-20 mb-1 flex rounded-full border border-[#dcdcdc] bg-white p-1 shadow-lg group-hover/reactions:visible group-focus-within/reactions:visible">
          {choices.map((emoji) => <button key={emoji} type="button" disabled={saving !== null} onClick={() => toggle(emoji)} className="rounded-full p-1 hover:bg-[#f5f5f5]" aria-label={`React ${emoji}`}>{emoji}</button>)}
        </div>
      </div>
    </div>
  )
}

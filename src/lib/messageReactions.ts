import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const MESSAGE_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏'] as const

export const validMessageReaction = (value: unknown): value is typeof MESSAGE_REACTION_EMOJIS[number] =>
  typeof value === 'string' && (MESSAGE_REACTION_EMOJIS as readonly string[]).includes(value)

export type MessageReactionSummary = { emoji: string; count: number; reacted: boolean }

export async function messageReactionMap(messageIds: string[], currentUserId: string) {
  const map = new Map<string, MessageReactionSummary[]>()
  if (!messageIds.length) return map
  const { data, error } = await supabaseAdmin.from('message_reactions')
    .select('message_id,user_id,emoji').in('message_id', messageIds)
  if (error) throw error
  const grouped = new Map<string, Map<string, { count: number; reacted: boolean }>>()
  for (const row of data || []) {
    const byEmoji = grouped.get(row.message_id) || new Map()
    const summary = byEmoji.get(row.emoji) || { count: 0, reacted: false }
    summary.count += 1
    if (row.user_id === currentUserId) summary.reacted = true
    byEmoji.set(row.emoji, summary)
    grouped.set(row.message_id, byEmoji)
  }
  grouped.forEach((byEmoji, messageId) => {
    map.set(messageId, Array.from(byEmoji, ([emoji, value]) => ({ emoji, ...value })))
  })
  return map
}

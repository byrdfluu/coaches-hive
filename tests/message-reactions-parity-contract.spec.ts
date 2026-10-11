import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('message reactions are durable participant-scoped records', () => {
  const sql = read('supabase/migrations/20261011020000_message_reactions.sql')
  expect(sql).toContain('create table if not exists public.message_reactions')
  expect(sql).toContain('unique (message_id, user_id, emoji)')
  expect(sql).toContain('tp.user_id = auth.uid()')
  expect(sql).toContain('user_id = auth.uid()')
  expect(sql).toContain('m.deleted_at is null')
})

test('web and mobile mutate and read the same reaction records', () => {
  const web = read('src/app/api/messages/[id]/reactions/route.ts')
  const mobile = read('src/app/api/mobile/messages/[messageId]/reactions/route.ts')
  const conversation = read('src/app/api/messages/conversation/route.ts')
  const mobileFeed = read('src/app/api/mobile/threads/[threadId]/messages/route.ts')
  for (const source of [web, mobile]) {
    expect(source).toContain("from('message_reactions')")
    expect(source).toContain('messageReactionMap')
  }
  expect(conversation).toContain('reactions: reactionsByMessage.get(message.id) || []')
  expect(mobileFeed).toContain('reactions:reactions.get(item.id)||[]')
})

test('reaction allowlist is shared across clients', () => {
  const helper = read('src/lib/messageReactions.ts')
  for (const emoji of ['👍','❤️','😂','😮','😢','👏']) expect(helper).toContain(emoji)
  expect(helper).toContain('validMessageReaction')
})

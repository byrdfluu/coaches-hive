import { NextResponse } from 'next/server'
import { getMobileRequestUser } from '@/lib/mobileRequestAuth'
import { mobileContractError } from '@/lib/mobileApiContract'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseUuid } from '@/lib/uuid'
import { canonicalUserAvatarMap, preserveVersionedAvatar } from '@/lib/mobileAvatarIdentity'

const decode = (value: string | null) => {
  if (!value) return null
  try {
    const row = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    return typeof row.updated_at === 'string' && parseUuid(row.id) ? row : null
  } catch { return null }
}
const encode = (row: { updated_at: string; id: string }) => Buffer.from(JSON.stringify(row)).toString('base64url')
const profileFor = (participant: any) => Array.isArray(participant?.profiles) ? participant.profiles[0] : participant?.profiles
const participantName = (participant: any) => String(profileFor(participant)?.full_name || '').trim() || 'Removed user'

export async function GET(request: Request) {
  const user = await getMobileRequestUser(request)
  if (!user) return mobileContractError('unauthorized', 'Authentication is required.', 401)
  const url = new URL(request.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 25))
  const cursor = decode(url.searchParams.get('cursor'))
  if (url.searchParams.has('cursor') && !cursor) return mobileContractError('thread_cursor_invalid', 'Refresh your conversations and try again.', 422)

  const { data: members, error: memberError } = await supabaseAdmin.from('thread_participants').select('thread_id,muted_at,pinned_at,archived_at,blocked_at').eq('user_id', user.id)
  if (memberError) return mobileContractError('threads_unavailable', 'Conversations are temporarily unavailable.', 503, true)
  const ids = Array.from(new Set((members || []).map(row => row.thread_id)))
  if (!ids.length) return NextResponse.json({ threads: [], next_cursor: null }, { headers: { 'Cache-Control': 'private, no-store' } })

  let query = (supabaseAdmin as any).from('threads').select('id,title,is_group,org_id,organization_id,organization_display_name,organization_profile_image_url,league_id,updated_at').in('id', ids).order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1)
  if (cursor) query = query.or(`updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.lt.${cursor.id})`)
  const { data, error } = await query
  if (error) return mobileContractError('threads_unavailable', 'Conversations are temporarily unavailable.', 503, true)
  const rows = data || [], more = rows.length > limit, selected = rows.slice(0, limit)
  const threadIds = selected.map((row: any) => row.id)
  const orgIds = Array.from(new Set<string>(selected.map((row: any) => row.organization_id ?? row.org_id).filter(Boolean)))
  const leagueIds = Array.from(new Set<string>(selected.map((row: any) => row.league_id).filter(Boolean)))
  const [{ data: orgs }, { data: settings }, { data: workspaces }, { data: leagues }, { data: participantRows }, { data: lastMessages }] = await Promise.all([
    orgIds.length ? supabaseAdmin.from('organizations').select('id,name').in('id', orgIds) : Promise.resolve({ data: [] }),
    orgIds.length ? supabaseAdmin.from('org_settings').select('org_id,org_name,profile_image_url').in('org_id', orgIds) : Promise.resolve({ data: [] }),
    orgIds.length ? supabaseAdmin.from('business_workspaces').select('organization_id,display_name,status').in('organization_id', orgIds).eq('status', 'active') : Promise.resolve({ data: [] }),
    leagueIds.length ? supabaseAdmin.from('leagues').select('id,name,profile_image_url').in('id', leagueIds) : Promise.resolve({ data: [] }),
    (supabaseAdmin as any).from('thread_participants').select('thread_id,user_id,role,profiles(full_name,avatar_url)').in('thread_id', threadIds),
    supabaseAdmin.from('messages').select('id,thread_id,content,body,created_at,sender_id').in('thread_id', threadIds).order('created_at', { ascending: false }),
  ])

  const participantsByThread = new Map<string, any[]>(), seen = new Set<string>()
  for (const participant of participantRows || []) {
    const key = `${participant.thread_id}:${participant.user_id}`
    if (seen.has(key)) continue
    seen.add(key)
    participantsByThread.set(participant.thread_id, [...(participantsByThread.get(participant.thread_id) || []), participant])
  }
  const counterpartIds = (participantRows || []).filter((row: any) => row.user_id !== user.id).map((row: any) => row.user_id)
  const avatarMap = await canonicalUserAvatarMap(counterpartIds)
  const orgMap = new Map((orgs || []).map(row => [row.id, row])), settingMap = new Map((settings || []).map(row => [row.org_id, row])), workspaceMap = new Map((workspaces || []).map(row => [row.organization_id, row])), leagueMap = new Map((leagues || []).map(row => [row.id, row]))
  const last = new Map<string, any>()
  for (const message of lastMessages || []) if (!last.has(message.thread_id)) last.set(message.thread_id, message)
  const incoming = (lastMessages || []).filter(message => message.sender_id !== user.id)
  const { data: receipts } = incoming.length ? await supabaseAdmin.from('mobile_message_receipts').select('message_id').eq('user_id', user.id).not('read_at', 'is', null).in('message_id', incoming.map(message => message.id)) : { data: [] }
  const readIds = new Set((receipts || []).map(row => row.message_id)), unread = new Map<string, number>()
  for (const message of incoming) if (!readIds.has(message.id)) unread.set(message.thread_id, (unread.get(message.thread_id) || 0) + 1)
  const preferenceMap = new Map((members || []).map(row => [row.thread_id, row]))

  const threads = selected.map((row: any) => {
    const orgId = row.organization_id ?? row.org_id ?? null, organization = orgId ? orgMap.get(orgId) : null, setting = orgId ? settingMap.get(orgId) : null, workspace = orgId ? workspaceMap.get(orgId) : null, league = row.league_id ? leagueMap.get(row.league_id) : null
    const counterparts = (participantsByThread.get(row.id) || []).filter(participant => participant.user_id !== user.id), counterpart = counterparts[0] || null
    const isOrganization = Boolean(orgId), isGroup = Boolean(row.is_group), isDirect = !isOrganization && !league && !isGroup
    const threadType = isOrganization ? 'organization_contact' : isGroup || league ? 'group' : 'direct'
    const organizationName = isOrganization ? String(organization?.name || setting?.org_name || workspace?.display_name || row.organization_display_name || row.title || `Organization ${String(orgId).slice(0, 8)}`) : null
    const counterpartDisplayName = isDirect ? participantName(counterpart) : null
    const groupTitle = threadType === 'group' ? String(row.title || league?.name || counterparts.map(participantName).sort().join(', ') || 'Group conversation') : null
    const counterpartAvatar = counterpart ? avatarMap.get(counterpart.user_id) || profileFor(counterpart)?.avatar_url : null
    const identityAvatar = isOrganization ? setting?.profile_image_url || row.organization_profile_image_url : league?.profile_image_url || (isDirect ? counterpartAvatar : null)
    const message = last.get(row.id), preference = preferenceMap.get(row.id)
    return {
      thread_id: row.id, thread_type: threadType, title: row.title, is_group: isGroup,
      organization_id: orgId, organization_name: organizationName, league_id: row.league_id || null, group_title: groupTitle,
      counterpart_user_id: isDirect ? counterpart?.user_id || null : null,
      counterpart_display_name: counterpartDisplayName, counterpart_avatar_url: preserveVersionedAvatar(counterpartAvatar),
      participant_user_id: isDirect ? counterpart?.user_id || null : null,
      display_name: organizationName || groupTitle || counterpartDisplayName || 'Removed user', profile_image_url: preserveVersionedAvatar(identityAvatar),
      updated_at: row.updated_at, unread_count: unread.get(row.id) || 0, muted: Boolean(preference?.muted_at), pinned: Boolean(preference?.pinned_at), archived: Boolean(preference?.archived_at), blocked: Boolean(preference?.blocked_at),
      last_message_preview: message ? String(message.content || message.body || '').slice(0, 160) : null, last_message_date: message?.created_at || null,
      last_message: message ? { message_id: message.id, preview: String(message.content || message.body || '').slice(0, 160), sender_id: message.sender_id, created_at: message.created_at } : null,
    }
  })
  const tail = selected.at(-1)
  return NextResponse.json({ threads, next_cursor: more && tail ? encode(tail) : null }, { headers: { 'Cache-Control': 'private, no-store' } })
}

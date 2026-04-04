'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import OrgSidebar from '@/components/OrgSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { formatTime } from '@/lib/dateUtils'
import { getOrgTypeConfig, normalizeOrgType } from '@/lib/orgTypeConfig'

type Announcement = {
  id: string
  title: string
  body: string
  audience: string
  createdAt: string
  total_sent?: number
  total_read?: number
}

type DirectThread = {
  id: string
  coach_id: string
  coach_name: string
  athlete_id: string
  athlete_name: string
  last_message: string
  last_time: string
}

type DirectMessage = {
  id: string
  thread_id: string
  sender_id: string
  sender_name: string
  body: string
  created_at: string
  attachments?: Array<{ url: string; name: string }>
}

type InboxThread = {
  id: string
  title: string
  last_message: string
  last_time: string
  unreadCount?: number
}

type InboxMessage = {
  id: string
  sender_id: string
  sender_name: string
  body: string
  created_at: string
  attachments?: Array<{ url: string; name: string }>
  pending?: boolean
}

type ParticipantOption = {
  id: string
  name: string
}

type RecipientSuggestion = {
  id: string
  label: string
  role: 'Coach' | 'Athlete' | 'User'
}

type PendingAttachment = {
  path: string
  url: string
  name: string
  type?: string
  size?: number
}

type MessageTargetOption = {
  id: string
  kind: 'org' | 'team'
  label: string
  orgId?: string
  teamId?: string
  orgName?: string
}

const formatRelativeTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

const formatMessageTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatTime(date)
}

const getInitials = (value?: string | null) => {
  if (!value) return 'U'
  const letters = value
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
  return (letters.slice(0, 2).join('') || 'U').toUpperCase()
}

export default function OrgMessagesPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState('')
  const [notice, setNotice] = useState('')
  const [threads, setThreads] = useState<DirectThread[]>([])
  const [selectedThread, setSelectedThread] = useState('')
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [coaches, setCoaches] = useState<ParticipantOption[]>([])
  const [athletes, setAthletes] = useState<ParticipantOption[]>([])
  const [newCoach, setNewCoach] = useState('')
  const [newAthlete, setNewAthlete] = useState('')
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [threadNotice, setThreadNotice] = useState('')
  const [orgInboxThreads, setOrgInboxThreads] = useState<InboxThread[]>([])
  const [threadSearch, setThreadSearch] = useState('')
  const [threadFilter, setThreadFilter] = useState<'all' | 'unread' | 'archived' | 'blocked'>('all')
  const [orgInboxSelectedId, setOrgInboxSelectedId] = useState('')
  const [orgInboxMessages, setOrgInboxMessages] = useState<InboxMessage[]>([])
  const [orgInboxDraft, setOrgInboxDraft] = useState('')
  const [orgInboxAttachment, setOrgInboxAttachment] = useState<PendingAttachment | null>(null)
  const [orgInboxUploading, setOrgInboxUploading] = useState(false)
  const [orgInboxNotice, setOrgInboxNotice] = useState('')
  const [orgInboxLoading, setOrgInboxLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [orgSending, setOrgSending] = useState(false)
  const [showOrgComposer, setShowOrgComposer] = useState(false)
  const [showThreadDrawer, setShowThreadDrawer] = useState(false)
  const [showNewThread, setShowNewThread] = useState(false)
  const [orgTeams, setOrgTeams] = useState<ParticipantOption[]>([])
  const [orgInboxMutedIds, setOrgInboxMutedIds] = useState<string[]>([])
  const [orgInboxArchivedIds, setOrgInboxArchivedIds] = useState<string[]>([])
  const [orgInboxBlockedIds, setOrgInboxBlockedIds] = useState<string[]>([])
  const [orgInboxPinnedIds, setOrgInboxPinnedIds] = useState<string[]>([])
  const [startOrgId, setStartOrgId] = useState('')
  const [orgDisplayName, setOrgDisplayName] = useState('Organization')
  const [orgType, setOrgType] = useState('organization')
  const [startTeamId, setStartTeamId] = useState('')
  const orgConfig = useMemo(() => getOrgTypeConfig(orgType), [orgType])
  const announcementTemplates = useMemo(() => orgConfig.announcementTemplates, [orgConfig.announcementTemplates])
  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const singularTeamLabel = useMemo(() => {
    const label = orgConfig.portal.teamsLabel
    return label.endsWith('s') ? label.slice(0, -1) : label
  }, [orgConfig.portal.teamsLabel])
  const audienceOptions = useMemo(() => {
    const teamLabel = orgConfig.portal.teamsLabel.toLowerCase()
    return [`All ${teamLabel}`, ...orgTeams.map((team) => team.name || 'Team')]
  }, [orgConfig.portal.teamsLabel, orgTeams])
  const [targetSelection, setTargetSelection] = useState('')
  const targetOptions = useMemo<MessageTargetOption[]>(() => {
    const options: MessageTargetOption[] = []
    options.push({
      id: 'org',
      kind: 'org',
      label: `Entire ${orgConfig.label.toLowerCase()} • ${orgDisplayName}`,
      orgId: startOrgId,
      orgName: orgDisplayName,
    } as MessageTargetOption)
    orgTeams.forEach((team) => {
      options.push({
        id: `team-${team.id}`,
        kind: 'team',
        label: `${orgConfig.portal.teamsLabel} • ${team.name}`,
        teamId: team.id,
      })
    })
    return options
  }, [orgConfig.label, orgConfig.portal.teamsLabel, orgDisplayName, orgTeams, startOrgId])

  useEffect(() => {
    if (!audienceOptions.length) return
    setAudience((prev) => (audienceOptions.includes(prev) ? prev : audienceOptions[0]))
  }, [audienceOptions])
  const activeTarget = useMemo(
    () => targetOptions.find((option) => option.id === targetSelection) || targetOptions[0],
    [targetOptions, targetSelection]
  )

  useEffect(() => {
    setSelectedTemplate('')
  }, [orgType])
  useEffect(() => {
    if (!targetOptions.length) return
    setTargetSelection((prev) =>
      targetOptions.some((option) => option.id === prev) ? prev : targetOptions[0].id
    )
  }, [targetOptions])
  useEffect(() => {
    if (!activeTarget) return
    if (activeTarget.kind === 'org') {
      setStartOrgId(activeTarget.orgId || '')
      setStartTeamId('')
    } else {
      setStartTeamId(activeTarget.teamId || '')
    }
  }, [activeTarget])
  const [startMessage, setStartMessage] = useState('')
  const [startNotice, setStartNotice] = useState('')
  const [newCoachQuery, setNewCoachQuery] = useState('')
  const [newAthleteQuery, setNewAthleteQuery] = useState('')
  const [coachLoading, setCoachLoading] = useState(false)
  const [athleteLoading, setAthleteLoading] = useState(false)
  const [lookupTeams, setLookupTeams] = useState<ParticipantOption[]>([])
  const [lookupCoaches, setLookupCoaches] = useState<ParticipantOption[]>([])
  const [lookupAthletes, setLookupAthletes] = useState<ParticipantOption[]>([])
  const orgInboxMessagesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (!active) return
      setCurrentUserId(data.user?.id ?? null)
    }
    loadUser()
    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (!currentUserId) return
    let active = true
    const loadTeams = async () => {
      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('org_id')
        .eq('user_id', currentUserId)
        .maybeSingle()
      if (!active) return
      const membershipRow = (membership || null) as { org_id?: string | null } | null
      if (!membershipRow?.org_id) {
        setOrgTeams([])
        setStartTeamId('')
        setStartOrgId('')
        setOrgDisplayName('Organization')
        return
      }
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, org_type')
        .eq('id', membershipRow.org_id)
        .maybeSingle()
      const orgRow = (org || null) as { id?: string | null; name?: string | null; org_type?: string | null } | null
      if (!active) return
      setStartOrgId(orgRow?.id || membershipRow.org_id)
      setOrgDisplayName(orgRow?.name || 'Organization')
      setOrgType(normalizeOrgType(orgRow?.org_type))
      const { data: teamRows } = await supabase
        .from('org_teams')
        .select('id, name')
        .eq('org_id', membershipRow.org_id)
      const orgTeamRows = (teamRows || []) as Array<{ id: string; name?: string | null }>
      const teamOptions = orgTeamRows.map((team) => ({
        id: team.id,
        name: team.name || 'Team',
      }))
      setOrgTeams(teamOptions)
      setStartTeamId(teamOptions[0]?.id || '')
    }
    loadTeams()
    return () => {
      active = false
    }
  }, [currentUserId, supabase])

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThread) || null,
    [threads, selectedThread]
  )

  const orgUnreadCount = useMemo(
    () => orgInboxMessages.filter((message) => message.sender_id !== currentUserId && !message.pending).length,
    [orgInboxMessages, currentUserId]
  )
  const unreadThreadCount = useMemo(
    () => orgInboxThreads.filter((thread) => (thread.unreadCount || 0) > 0).length,
    [orgInboxThreads]
  )
  const archivedThreadCount = useMemo(
    () => orgInboxThreads.filter((thread) => orgInboxArchivedIds.includes(thread.id)).length,
    [orgInboxArchivedIds, orgInboxThreads]
  )
  const blockedThreadCount = useMemo(
    () => orgInboxThreads.filter((thread) => orgInboxBlockedIds.includes(thread.id)).length,
    [orgInboxBlockedIds, orgInboxThreads]
  )
  const scopedOrgInboxThreads = useMemo(() => {
    if (threadFilter === 'archived') {
      return orgInboxThreads.filter((thread) => orgInboxArchivedIds.includes(thread.id))
    }
    if (threadFilter === 'blocked') {
      return orgInboxThreads.filter((thread) => orgInboxBlockedIds.includes(thread.id))
    }
    return orgInboxThreads.filter(
      (thread) => !orgInboxArchivedIds.includes(thread.id) && !orgInboxBlockedIds.includes(thread.id)
    )
  }, [orgInboxArchivedIds, orgInboxBlockedIds, orgInboxThreads, threadFilter])
  const filteredThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase()
    const filtered = scopedOrgInboxThreads.filter((thread) => {
      const unreadCount = thread.unreadCount || 0
      if (threadFilter === 'unread' && unreadCount === 0) return false
      if (!query) return true
      const haystack = `${thread.title} ${thread.last_message}`.toLowerCase()
      return haystack.includes(query)
    })
    const pinned = new Set(orgInboxPinnedIds)
    return [...filtered].sort((a, b) => {
      const aPinned = pinned.has(a.id)
      const bPinned = pinned.has(b.id)
      if (aPinned && !bPinned) return -1
      if (!aPinned && bPinned) return 1
      return new Date(b.last_time || '').getTime() - new Date(a.last_time || '').getTime()
    })
  }, [orgInboxPinnedIds, scopedOrgInboxThreads, threadFilter, threadSearch])
  const threadMemberCount = useMemo(() => {
    const memberIds = new Set<string>()
    orgInboxMessages.forEach((message) => {
      if (message.sender_id) memberIds.add(message.sender_id)
    })
    if (currentUserId) memberIds.add(currentUserId)
    return Math.max(memberIds.size, 1)
  }, [orgInboxMessages, currentUserId])
  const visibleAnnouncements = announcements.slice(0, 3)
  const showAnnouncementsModal = (searchParams?.get('announcements') || '') === 'all'
  const openAnnouncementsModal = () => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('announcements', 'all')
    router.push(`?${params.toString()}`)
  }
  const closeAnnouncementsModal = () => {
    const params = new URLSearchParams(searchParams?.toString())
    params.delete('announcements')
    const query = params.toString()
    router.push(query ? `?${query}` : '/org/messages')
  }
  useEffect(() => {
    const query = newCoachQuery.trim()
    if (!query) {
      setLookupCoaches([])
      setCoachLoading(false)
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setCoachLoading(true)
      try {
        const response = await fetch(
          `/api/messages/lookup?query=${encodeURIComponent(query)}&types=user`,
          { signal: controller.signal }
        )
        if (!response.ok) return
        const payload = await response.json().catch(() => ({}))
        const results = (payload.results || [])
          .filter((item: { role?: string }) => String(item.role || '').includes('coach'))
          .map((item: { id: string; label: string }) => ({
            id: item.id,
            name: item.label,
          }))
        setLookupCoaches(results)
      } finally {
        setCoachLoading(false)
      }
    }, 200)
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [newCoachQuery])

  useEffect(() => {
    const query = newAthleteQuery.trim()
    if (!query) {
      setLookupAthletes([])
      setAthleteLoading(false)
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setAthleteLoading(true)
      try {
        const response = await fetch(
          `/api/messages/lookup?query=${encodeURIComponent(query)}&types=user`,
          { signal: controller.signal }
        )
        if (!response.ok) return
        const payload = await response.json().catch(() => ({}))
        const results = (payload.results || [])
          .filter((item: { role?: string }) => String(item.role || '').includes('athlete'))
          .map((item: { id: string; label: string }) => ({
            id: item.id,
            name: item.label,
          }))
        setLookupAthletes(results)
      } finally {
        setAthleteLoading(false)
      }
    }, 200)
    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [newAthleteQuery])

  const selectedCoachLabel = useMemo(
    () => coaches.find((coach) => coach.id === newCoach)?.name || '',
    [coaches, newCoach]
  )

  const selectedAthleteLabel = useMemo(
    () => athletes.find((athlete) => athlete.id === newAthlete)?.name || '',
    [athletes, newAthlete]
  )

  const coachSuggestions = useMemo(() => {
    const query = newCoachQuery.trim().toLowerCase()
    if (!query) return [] as ParticipantOption[]
    if (selectedCoachLabel && query === selectedCoachLabel.toLowerCase()) {
      return []
    }
    return lookupCoaches
  }, [lookupCoaches, newCoachQuery, selectedCoachLabel])

  const athleteSuggestions = useMemo(() => {
    const query = newAthleteQuery.trim().toLowerCase()
    if (!query) return [] as ParticipantOption[]
    if (selectedAthleteLabel && query === selectedAthleteLabel.toLowerCase()) {
      return []
    }
    return lookupAthletes
  }, [lookupAthletes, newAthleteQuery, selectedAthleteLabel])

  const handleCoachChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setNewCoachQuery(value)
      const normalized = value.trim().toLowerCase()
      const match = lookupCoaches.find((coach) => coach.name.toLowerCase() === normalized)
      setNewCoach(match ? match.id : '')
    },
    [lookupCoaches]
  )

  const handleCoachPick = useCallback((coach: ParticipantOption) => {
    setNewCoach(coach.id)
    setNewCoachQuery(coach.name)
  }, [])

  const handleAthleteChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setNewAthleteQuery(value)
      const normalized = value.trim().toLowerCase()
      const match = lookupAthletes.find((athlete) => athlete.name.toLowerCase() === normalized)
      setNewAthlete(match ? match.id : '')
    },
    [lookupAthletes]
  )

  const handleAthletePick = useCallback((athlete: ParticipantOption) => {
    setNewAthlete(athlete.id)
    setNewAthleteQuery(athlete.name)
  }, [])

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      setNotice('Add a title and message to post.')
      return
    }
    try {
      const res = await fetch('/api/org/messages/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), audience }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice(data?.error || 'Unable to post announcement.')
        return
      }
      const next: Announcement = {
        id: data.announcement_id || `org-msg-${Date.now()}`,
        title: title.trim(),
        body: body.trim(),
        audience,
        createdAt: 'Just now',
        total_sent: data.sent_count ?? 0,
        total_read: 0,
      }
      setAnnouncements((prev) => [next, ...prev])
      setTitle('')
      setBody('')
      setSelectedTemplate('')
      setAudience(audienceOptions[0] || '')
      setNotice(`Announcement posted and delivered to ${data.sent_count ?? 0} members.`)
    } catch {
      setNotice('Unable to post announcement.')
    }
  }

  const handleTemplateSelect = (value: string) => {
    setSelectedTemplate(value)
    if (!value) return
    const index = Number.parseInt(value, 10)
    const template = announcementTemplates[index]
    if (!template) return
    setTitle(template.title)
    setBody(template.body)
  }

  const updateThreadPreference = useCallback(
    async (threadId: string, action: string) => {
      const response = await fetch('/api/messages/thread-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, action }),
      })
      return response.ok
    },
    []
  )

  const toggleOrgInboxMute = useCallback(
    async (threadId: string) => {
      const isMuted = orgInboxMutedIds.includes(threadId)
      const ok = await updateThreadPreference(threadId, isMuted ? 'unmute' : 'mute')
      if (!ok) {
        showToast('Unable to update thread.')
        return
      }
      setOrgInboxMutedIds((prev) => {
        const next = isMuted ? prev.filter((id) => id !== threadId) : [...prev, threadId]
        showToast(isMuted ? 'Thread unmuted.' : 'Thread muted.')
        return next
      })
    },
    [orgInboxMutedIds, showToast, updateThreadPreference]
  )

  const archiveOrgInboxThread = useCallback(
    async (threadId: string) => {
      const ok = await updateThreadPreference(threadId, 'archive')
      if (!ok) {
        showToast('Unable to archive thread.')
        return
      }
      setOrgInboxArchivedIds((prev) => [...prev, threadId])
      showToast('Thread archived.')
    },
    [showToast, updateThreadPreference]
  )

  const unarchiveOrgInboxThread = useCallback(
    async (threadId: string) => {
      const ok = await updateThreadPreference(threadId, 'unarchive')
      if (!ok) {
        showToast('Unable to unarchive thread.')
        return
      }
      setOrgInboxArchivedIds((prev) => prev.filter((id) => id !== threadId))
      showToast('Thread restored.')
    },
    [showToast, updateThreadPreference]
  )

  const blockOrgInboxThread = useCallback(
    async (threadId: string) => {
      const ok = await updateThreadPreference(threadId, 'block')
      if (!ok) {
        showToast('Unable to block thread.')
        return
      }
      setOrgInboxBlockedIds((prev) => [...prev, threadId])
      showToast('Thread blocked.')
    },
    [showToast, updateThreadPreference]
  )

  const unblockOrgInboxThread = useCallback(
    async (threadId: string) => {
      const ok = await updateThreadPreference(threadId, 'unblock')
      if (!ok) {
        showToast('Unable to unblock thread.')
        return
      }
      setOrgInboxBlockedIds((prev) => prev.filter((id) => id !== threadId))
      showToast('Thread unblocked.')
    },
    [showToast, updateThreadPreference]
  )

  const loadOrgInboxThreads = useCallback(async () => {
    if (!currentUserId) return
    setOrgInboxLoading(true)
    setOrgInboxNotice('')

    const { data: membershipRows } = await supabase
      .from('thread_participants')
      .select('thread_id, muted_at, archived_at, blocked_at, pinned_at')
      .eq('user_id', currentUserId)
    const participantRows = (membershipRows || []) as Array<{
      thread_id: string
      muted_at?: string | null
      archived_at?: string | null
      blocked_at?: string | null
      pinned_at?: string | null
    }>

    setOrgInboxMutedIds(
      participantRows.filter((row) => row.muted_at).map((row) => row.thread_id)
    )
    setOrgInboxArchivedIds(
      participantRows.filter((row) => row.archived_at).map((row) => row.thread_id)
    )
    setOrgInboxBlockedIds(
      participantRows.filter((row) => row.blocked_at).map((row) => row.thread_id)
    )
    setOrgInboxPinnedIds(
      participantRows.filter((row) => row.pinned_at).map((row) => row.thread_id)
    )

    const threadIds = (membershipRows || []).map((row) => row.thread_id)
    if (threadIds.length === 0) {
      setOrgInboxThreads([])
      setOrgInboxLoading(false)
      return
    }

    const { data: threads } = await supabase
      .from('threads')
      .select('id, title, is_group, created_at')
      .in('id', threadIds)
      .eq('is_group', true)

    const orgPrefix = `${orgConfig.label.toLowerCase()}:`
    const teamPrefix = `${singularTeamLabel.toLowerCase()}:`
    const threadRows = (threads || []) as Array<{
      id: string
      title?: string | null
      created_at?: string | null
    }>
    const groupThreads = threadRows.filter((thread) => {
      const title = String(thread.title || '').toLowerCase()
      return title.startsWith('org:') || title.startsWith('team:') || title.startsWith(orgPrefix) || title.startsWith(teamPrefix)
    })

    const groupIds = groupThreads.map((thread) => thread.id)
    const { data: messageRows } = groupIds.length
      ? await supabase
          .from('messages')
          .select('id, thread_id, sender_id, body, content, created_at')
          .in('thread_id', groupIds)
          .order('created_at', { ascending: false })
      : { data: [] }

    const lastMessageByThread = new Map<string, { body: string; created_at: string }>()
    const unreadByThread = new Map<string, number>()
    const messageList = (messageRows || []) as Array<{
      id?: string
      thread_id?: string
      sender_id?: string
      body?: string | null
      content?: string | null
      created_at?: string | null
    }>
    messageList.forEach((message) => {
      if (!message.thread_id) return
      if (!lastMessageByThread.has(message.thread_id)) {
        lastMessageByThread.set(message.thread_id, {
          body: message.body || message.content || '',
          created_at: message.created_at || '',
        })
      }
    })

    if (currentUserId) {
      const messageIds = messageList.map((message) => message.id).filter(Boolean) as string[]
      const { data: receiptRows } = messageIds.length
        ? await supabase
            .from('message_receipts')
            .select('message_id, read_at')
            .eq('user_id', currentUserId)
            .in('message_id', messageIds)
        : { data: [] }
      const receipts = (receiptRows || []) as Array<{ message_id: string; read_at?: string | null }>
      const readSet = new Set(
        receipts.filter((row) => row.read_at).map((row) => row.message_id)
      )
      messageList.forEach((message) => {
        if (!message.thread_id || !message.id) return
        if (message.sender_id === currentUserId) return
        if (readSet.has(message.id)) return
        unreadByThread.set(message.thread_id, (unreadByThread.get(message.thread_id) || 0) + 1)
      })
    }

    const items = groupThreads.map((thread) => {
      const last = lastMessageByThread.get(thread.id)
      return {
        id: thread.id,
        title: thread.title || 'Group thread',
        last_message: last?.body || 'Start the conversation',
        last_time: last?.created_at || thread.created_at || '',
        unreadCount: unreadByThread.get(thread.id) || 0,
      }
    })

    items.sort((a, b) => new Date(b.last_time).getTime() - new Date(a.last_time).getTime())
    setOrgInboxThreads(items)
    setOrgInboxLoading(false)
  }, [currentUserId, orgConfig.label, singularTeamLabel, supabase])

  const toggleOrgInboxPinned = useCallback(
    async (threadId: string) => {
      const isPinned = orgInboxPinnedIds.includes(threadId)
      const ok = await updateThreadPreference(threadId, isPinned ? 'unpin' : 'pin')
      if (!ok) {
        showToast('Unable to update thread.')
        return
      }
      setOrgInboxPinnedIds((prev) =>
        isPinned ? prev.filter((id) => id !== threadId) : [...prev, threadId]
      )
      showToast(isPinned ? 'Thread unpinned.' : 'Thread pinned.')
    },
    [orgInboxPinnedIds, showToast, updateThreadPreference]
  )

  const markOrgInboxUnread = useCallback(
    async (threadId: string) => {
      const ok = await updateThreadPreference(threadId, 'mark_unread')
      if (!ok) {
        showToast('Unable to mark unread.')
        return
      }
      await loadOrgInboxThreads()
      showToast('Marked as unread.')
    },
    [loadOrgInboxThreads, showToast, updateThreadPreference]
  )

  const loadOrgInboxMessages = useCallback(
    async (threadId: string) => {
      if (!threadId) return
      const { data: messageRows } = await supabase
        .from('messages')
        .select('id, sender_id, body, content, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
      const orgMessageRows = (messageRows || []) as Array<{
        id: string
        sender_id: string
        body?: string | null
        content?: string | null
        created_at?: string | null
      }>

      const messageIds = Array.from(new Set(orgMessageRows.map((message) => message.id)))
      const { data: attachmentRows } = messageIds.length
        ? await supabase
            .from('message_attachments')
            .select('message_id, file_url, file_name')
            .in('message_id', messageIds)
        : { data: [] }
      const attachments = (attachmentRows || []) as Array<{
        message_id?: string | null
        file_url?: string | null
        file_name?: string | null
      }>
      const attachmentMap = new Map<string, Array<{ url: string; name: string }>>()
      attachments.forEach((row) => {
        if (!row.message_id || !row.file_url) return
        const list = attachmentMap.get(row.message_id) || []
        list.push({
          url: row.file_url,
          name: row.file_name || 'Attachment',
        })
        attachmentMap.set(row.message_id, list)
      })

      const senderIds = Array.from(new Set(orgMessageRows.map((message) => message.sender_id)))
      const { data: senders } = senderIds.length
        ? await supabase.from('profiles').select('id, full_name, email').in('id', senderIds)
        : { data: [] }

      const senderRows = (senders || []) as Array<{ id: string; full_name?: string | null; email?: string | null }>
      const senderMap = new Map<string, { full_name?: string | null; email?: string | null }>()
      senderRows.forEach((sender) => senderMap.set(sender.id, sender))

      const inboxMessages = orgMessageRows.map((message) => ({
        id: message.id,
        sender_id: message.sender_id,
        sender_name: senderMap.get(message.sender_id)?.full_name || senderMap.get(message.sender_id)?.email || 'User',
        body: message.body || message.content || '',
        created_at: message.created_at || '',
        attachments: attachmentMap.get(message.id) || [],
      }))

      setOrgInboxMessages(inboxMessages)

      if (currentUserId && messageIds.length > 0) {
        await fetch('/api/messages/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message_ids: messageIds, receipt: 'read' }),
        })
      }
    },
    [currentUserId, supabase]
  )

  const handleOrgInboxAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setOrgInboxUploading(true)
    const form = new FormData()
    form.append('file', file)
    const response = await fetch('/api/storage/attachment', {
      method: 'POST',
      body: form,
    })
    if (!response.ok) {
      setOrgInboxNotice('Unable to upload attachment.')
      setOrgInboxUploading(false)
      return
    }
    const payload = await response.json()
    setOrgInboxAttachment(payload)
    setOrgInboxUploading(false)
  }

  const handleOrgInboxSend = async () => {
    const content = orgInboxDraft.trim()
    if (!orgInboxSelectedId || (!content && !orgInboxAttachment)) return
    if (!currentUserId) {
      setOrgInboxNotice('Unable to identify your account.')
      return
    }

    const now = new Date()
    const optimisticMessage: InboxMessage = {
      id: `pending-${now.getTime()}`,
      sender_id: currentUserId,
      sender_name: 'You',
      body: content || '(Attachment)',
      created_at: now.toISOString(),
      attachments: orgInboxAttachment ? [{ url: orgInboxAttachment.url, name: orgInboxAttachment.name }] : [],
      pending: true,
    }
    setOrgInboxMessages((prev) => [...prev, optimisticMessage])
    setOrgInboxDraft('')
    const attachmentToSend = orgInboxAttachment
    setOrgInboxAttachment(null)
    setOrgSending(true)
    setToastMessage('Sending message...')

    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: orgInboxSelectedId,
          body: content,
          attachment: attachmentToSend,
        }),
      })

      if (!response.ok) {
        setOrgInboxNotice('Unable to send message.')
        setToastMessage('Unable to send message.')
        return
      }

      await loadOrgInboxMessages(orgInboxSelectedId)
      await loadOrgInboxThreads()
      setToastMessage('Message sent.')
    } catch (error) {
      console.error('Unable to send org inbox message:', error)
      setOrgInboxNotice('Unable to send message.')
      setToastMessage('Unable to send message.')
    } finally {
      setOrgSending(false)
      setOrgInboxAttachment(null)
    }
  }

  const handleSendMessage = async () => {
    const content = startMessage.trim()
    if (!content) {
      setStartNotice('Write a message to send.')
      return
    }
    if (!activeTarget) {
      setStartNotice('Select a target to message.')
      return
    }
    if (activeTarget.kind === 'org' && !activeTarget.orgId) {
      setStartNotice(`${orgConfig.label} not ready yet.`)
      return
    }
    if (activeTarget.kind === 'team' && !activeTarget.teamId) {
      setStartNotice(`${singularTeamLabel} not ready yet.`)
      return
    }
    setStartNotice('')
    setOrgSending(true)
    setToastMessage('Sending message...')

    const createTitle = () => {
      if (!activeTarget) return ''
      if (activeTarget.kind === 'org') {
        return `${orgConfig.label}: ${activeTarget.orgName || orgDisplayName}`
      }
      const teamName = activeTarget.label.split('•')[1]?.trim() || singularTeamLabel
      return `${singularTeamLabel}: ${teamName}`
    }

    try {
      const payloadBody: Record<string, any> = {
        target: activeTarget.kind,
        first_message: content,
      }
      if (activeTarget.kind === 'org') {
        payloadBody.org_id = activeTarget.orgId
      } else {
        payloadBody.team_id = activeTarget.teamId
      }
      const response = await fetch('/api/messages/org-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setStartNotice(payload?.error || 'Unable to send message.')
        setToastMessage('Unable to send message.')
        setOrgSending(false)
        return
      }

      const payload = await response.json().catch(() => ({}))
      setStartMessage('')
      setOrgSending(false)
      setToastMessage('Message sent.')
      await loadOrgInboxThreads()
      if (payload.thread_id) {
        setOrgInboxSelectedId(payload.thread_id)
        await loadOrgInboxMessages(payload.thread_id)
      }
    } catch (error) {
      console.error('Unable to send org message:', error)
      setStartNotice('Unable to send message.')
      setToastMessage('Unable to send message.')
      setOrgSending(false)
    }
  }

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true)
    setThreadNotice('')
    const response = await fetch('/api/org/messages/threads')
    if (!response.ok) {
      setThreads([])
      setThreadNotice('Unable to load direct message threads.')
      setThreadsLoading(false)
      return
    }
    const payload = await response.json()
    const nextCoaches = payload.coaches || []
    const nextAthletes = payload.athletes || []
    setThreads(payload.threads || [])
    setCoaches(nextCoaches)
    setAthletes(nextAthletes)
    setNewCoach(nextCoaches[0]?.id || '')
    setNewCoachQuery(nextCoaches[0]?.name || '')
    setNewAthlete(nextAthletes[0]?.id || '')
    setNewAthleteQuery(nextAthletes[0]?.name || '')
    setThreadsLoading(false)
  }, [])

  const loadMessages = useCallback(async (threadId: string) => {
    if (!threadId) return
    const response = await fetch(`/api/org/messages/thread?thread_id=${threadId}`)
    if (!response.ok) {
      setMessages([])
      return
    }
    const payload = await response.json()
    setMessages(payload.messages || [])
    const messageIds = (payload.messages || []).map((message: { id: string }) => message.id)
    if (currentUserId && messageIds.length > 0) {
      await fetch('/api/messages/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_ids: messageIds, receipt: 'read' }),
      })
    }
  }, [currentUserId])

  const handleStartThread = async () => {
    if (!newCoach || !newAthlete) {
      setThreadNotice('Select a coach and athlete to start a 1:1 thread.')
      return
    }
    setThreadNotice('')

    const response = await fetch('/api/org/messages/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: newCoach, athlete_id: newAthlete }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      setThreadNotice(payload?.error || 'Unable to start 1:1 thread.')
      return
    }

    const payload = await response.json()
    const threadId = payload.thread_id as string
    await loadThreads()
    if (threadId) {
      setSelectedThread(threadId)
      await loadMessages(threadId)
    }
  }

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    setAnnouncementsLoading(true)
    fetch('/api/org/messages/announcements')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.announcements) {
          setAnnouncements(
            (data.announcements as Array<{
              id: string; title: string; body: string; audience: string;
              created_at: string; total_sent?: number; total_read?: number
            }>).map((a) => ({
              id: a.id,
              title: a.title,
              body: a.body,
              audience: a.audience,
              createdAt: a.created_at,
              total_sent: a.total_sent,
              total_read: a.total_read,
            }))
          )
        }
      })
      .catch(() => {})
      .finally(() => setAnnouncementsLoading(false))
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    loadOrgInboxThreads()
  }, [currentUserId, loadOrgInboxThreads])

  useEffect(() => {
    if (!selectedThread && threads.length > 0) {
      setSelectedThread(threads[0].id)
    }
  }, [selectedThread, threads])

  useEffect(() => {
    if (!orgInboxSelectedId && orgInboxThreads.length > 0) {
      setOrgInboxSelectedId(orgInboxThreads[0].id)
    }
  }, [orgInboxSelectedId, orgInboxThreads])

  useEffect(() => {
    if (filteredThreads.length === 0) return
    if (!filteredThreads.some((thread) => thread.id === orgInboxSelectedId)) {
      setOrgInboxSelectedId(filteredThreads[0].id)
    }
  }, [filteredThreads, orgInboxSelectedId])

  useEffect(() => {
    if (!orgInboxMessagesRef.current) return
    orgInboxMessagesRef.current.scrollTop = orgInboxMessagesRef.current.scrollHeight
  }, [orgInboxMessages.length, orgInboxSelectedId])

  useEffect(() => {
    if (!selectedThread) {
      setMessages([])
      return
    }
    loadMessages(selectedThread)
  }, [loadMessages, selectedThread])

  useEffect(() => {
    if (!orgInboxSelectedId) {
      setOrgInboxMessages([])
      return
    }
    loadOrgInboxMessages(orgInboxSelectedId)
  }, [loadOrgInboxMessages, orgInboxSelectedId])

  useEffect(() => {
    if (threads.length === 0) return
    const threadIds = threads.map((thread) => thread.id)
    if (threadIds.length === 0) return

    const channel = supabase
      .channel(`org-messages-${threadIds.length}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=in.(${threadIds.join(',')})`,
        },
        (payload) => {
          const message = payload.new as DirectMessage
          if (message?.id && message?.sender_id) {
            if (message?.thread_id === selectedThread) {
              loadMessages(selectedThread)
            }
            loadThreads()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadMessages, loadThreads, selectedThread, supabase, threads])

  return (
    <>
      <main className="page-shell">
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 space-y-6">
          <RoleInfoBanner role="admin" />
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">{orgConfig.label}</p>
              <h1 className="display text-3xl font-semibold text-[#191919]">Messages</h1>
              <p className="mt-2 text-sm text-[#4a4a4a]">Send announcements and 1:1 coach-athlete notes.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button
                type="button"
                className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white"
                onClick={() => setShowOrgComposer(true)}
              >
                New message
              </button>
            </div>
          </header>

          <div className="grid items-start gap-6 lg:grid-cols-[200px_1fr]">
            <OrgSidebar />
            <div className="min-w-0 space-y-6">
              {/* Org inbox — coach-page layout */}
              <section className="relative">
                <div className="grid min-h-[520px] min-w-0 gap-5 lg:h-[calc(100vh-260px)] lg:grid-cols-[340px_minmax(0,1fr)]">
                  {showThreadDrawer && (
                    <button
                      type="button"
                      className="fixed inset-0 z-[300] bg-[#191919]/35 lg:hidden"
                      onClick={() => setShowThreadDrawer(false)}
                      aria-label="Close panel"
                    />
                  )}
                  {/* Thread list */}
                  <div className={`glass-card flex min-w-0 flex-col overflow-hidden border border-[#191919] bg-white p-4 ${showThreadDrawer ? 'fixed inset-y-0 left-0 z-[400] w-[92vw] max-w-[420px] shadow-xl lg:relative lg:inset-auto lg:z-auto lg:w-auto lg:shadow-none' : 'hidden lg:flex'}`}>
                    <div className="mb-3 flex items-center justify-between lg:hidden">
                      <p className="text-xs uppercase tracking-[0.25em] text-[#4a4a4a]">Threads</p>
                      <button
                        type="button"
                        onClick={() => setShowThreadDrawer(false)}
                        className="rounded-full border border-[#dcdcdc] px-2.5 py-1 text-xs font-semibold text-[#4a4a4a]"
                      >
                        Close
                      </button>
                    </div>
                    <div className="flex-shrink-0 flex flex-col gap-3">
                      <div className="flex gap-2">
                        <input
                          type="search"
                          value={threadSearch}
                          onChange={(event) => setThreadSearch(event.target.value)}
                          placeholder="Search by name or topic"
                          className="min-w-0 flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#191919]">
                        {([
                          { key: 'all', label: 'All' },
                          { key: 'unread', label: `Unread (${unreadThreadCount})` },
                          { key: 'archived', label: `Archived (${archivedThreadCount})` },
                          { key: 'blocked', label: `Blocked (${blockedThreadCount})` },
                        ] as const).map((f) => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => setThreadFilter(f.key)}
                            className={`rounded-full border px-3 py-1 transition ${
                              threadFilter === f.key ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 min-h-[140px] flex-1 overflow-y-auto space-y-2 pb-3">
                      {orgInboxLoading ? (
                        <LoadingState label="Loading inbox..." />
                      ) : orgInboxThreads.length === 0 ? (
                        <EmptyState
                          title={`No ${orgConfig.label.toLowerCase()} or ${singularTeamLabel.toLowerCase()} threads yet.`}
                          description={`Start a thread with a ${singularTeamLabel.toLowerCase()} or ${orgConfig.label.toLowerCase()} to keep everyone aligned.`}
                        />
                      ) : filteredThreads.length === 0 ? (
                        <EmptyState title="No matching threads." description="Try a new search or clear filters." />
                      ) : (
                        filteredThreads.map((thread) => {
                          const displayTitle = thread.title.includes(':') ? thread.title.split(':').slice(1).join(':').trim() : thread.title
                          const isActive = thread.id === orgInboxSelectedId
                          const isMuted = orgInboxMutedIds.includes(thread.id)
                          const isArchived = orgInboxArchivedIds.includes(thread.id)
                          const isBlocked = orgInboxBlockedIds.includes(thread.id)
                          const isPinned = orgInboxPinnedIds.includes(thread.id)
                          const unreadCount = thread.unreadCount || 0
                          return (
                            <div
                              key={thread.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => { setOrgInboxSelectedId(thread.id); setShowOrgComposer(false) }}
                              className={`group w-full rounded-2xl border px-4 py-3 text-left text-sm transition cursor-pointer ${isActive ? 'border-[#b80f0a] border-l-4 border-l-[#b80f0a] bg-[#fff6f5] shadow-sm' : 'border-[#dcdcdc] border-l-4 border-l-transparent bg-white hover:border-[#b80f0a] hover:border-l-[#b80f0a]'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    {isPinned ? <span className="rounded-full border border-[#b80f0a] bg-[#fff6f5] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#b80f0a]">Pinned</span> : null}
                                    <p className="truncate text-sm font-semibold text-[#191919]">{displayTitle}</p>
                                    {unreadCount > 0 ? <span className="rounded-full bg-[#b80f0a] px-2 py-0.5 text-[10px] font-semibold text-white">{unreadCount}</span> : null}
                                  </div>
                                  <p className="mt-1 truncate text-[11px] text-[#7a7a7a]">{thread.last_message || 'No messages yet.'}</p>
                                </div>
                                <span className="text-[11px] text-[#7a7a7a]">{formatRelativeTime(thread.last_time)}</span>
                              </div>
                              <div className="mt-3 flex max-h-0 flex-wrap items-center gap-1 overflow-hidden opacity-0 transition-[max-height,opacity] duration-200 group-hover:max-h-24 group-hover:opacity-100">
                                <button type="button" onClick={(e) => { e.stopPropagation(); toggleOrgInboxPinned(thread.id) }} className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">{isPinned ? 'Unpin' : 'Pin'}</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); markOrgInboxUnread(thread.id) }} className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">Mark unread</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); toggleOrgInboxMute(thread.id) }} className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">{isMuted ? 'Unmute' : 'Mute'}</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); isArchived ? unarchiveOrgInboxThread(thread.id) : archiveOrgInboxThread(thread.id) }} className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">{isArchived ? 'Unarchive' : 'Archive'}</button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); isBlocked ? unblockOrgInboxThread(thread.id) : blockOrgInboxThread(thread.id) }} className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">{isBlocked ? 'Unblock' : 'Block'}</button>
                                {isMuted ? <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] text-[#7a7a7a]">Muted</span> : null}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Conversation panel */}
                  <div className="glass-card flex min-w-0 flex-col overflow-hidden border border-[#191919] bg-white">
                    <div className="flex-shrink-0 border-b border-[#f0f0f0] px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => setShowThreadDrawer(true)}
                            className="rounded-full border border-[#dcdcdc] px-2.5 py-1 text-xs font-semibold text-[#4a4a4a] lg:hidden"
                          >
                            Threads
                          </button>
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-[0.25em] text-[#9a9a9a]">
                              {showOrgComposer ? 'New Message' : 'Conversation'}
                            </p>
                            <p className="truncate text-base font-semibold text-[#191919]">
                              {showOrgComposer
                                ? (activeTarget?.label || 'Select a target')
                                : (() => {
                                    const t = orgInboxThreads.find((t) => t.id === orgInboxSelectedId)
                                    if (!t) return 'Select a thread'
                                    return t.title.includes(':') ? t.title.split(':').slice(1).join(':').trim() : t.title
                                  })()}
                            </p>
                          </div>
                        </div>
                        {showOrgComposer ? (
                          <button
                            type="button"
                            onClick={() => setShowOrgComposer(false)}
                            className="rounded-full border border-[#dcdcdc] px-2.5 py-1 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919]"
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {showOrgComposer ? (
                      <form
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(); setShowOrgComposer(false) }}
                        className="flex-1 overflow-y-auto px-5 py-6 space-y-4"
                      >
                        <label className="block space-y-2">
                          <span className="text-xs font-semibold text-[#4a4a4a]">Send to</span>
                          <select
                            value={targetSelection}
                            onChange={(event) => setTargetSelection(event.target.value)}
                            className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                          >
                            {targetOptions.map((option) => (
                              <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <p className="text-xs text-[#4a4a4a]">
                          {activeTarget?.kind === 'org'
                            ? `Messaging ${activeTarget.orgName || orgDisplayName}.`
                            : `Messaging the selected ${singularTeamLabel.toLowerCase()}.`}
                        </p>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          {['Schedule update', 'Facility change', 'Roster reminder', 'Travel update'].map((label) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => setStartMessage(label)}
                              className="rounded-full border border-[#dcdcdc] px-3 py-1 font-semibold text-[#4a4a4a] hover:text-[#191919]"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className="w-full resize-none rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                          rows={5}
                          value={startMessage}
                          onChange={(event) => setStartMessage(event.target.value)}
                          placeholder="Write a message for the target..."
                        />
                        {startNotice ? <p className="text-xs text-[#4a4a4a]">{startNotice}</p> : null}
                        <button
                          type="submit"
                          className="rounded-full bg-[#b80f0a] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                          disabled={!activeTarget || orgSending}
                        >
                          {orgSending ? 'Sending…' : 'Send message'}
                        </button>
                      </form>
                    ) : (
                      <>
                        {orgInboxSelectedId ? (
                          <>
                            <div ref={orgInboxMessagesRef} className="flex-1 min-h-0 overflow-y-auto space-y-2 px-5 py-4">
                              {(() => {
                                const items: JSX.Element[] = []
                                let lastDateLabel = ''
                                let unreadInserted = false
                                orgInboxMessages.forEach((message) => {
                                  const isOwn = message.sender_id === currentUserId
                                  const initials = getInitials(message.sender_name)
                                  const dateLabel = new Date(message.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                  if (dateLabel !== lastDateLabel) {
                                    lastDateLabel = dateLabel
                                    items.push(
                                      <div key={`date-${message.id}`} className="flex justify-center">
                                        <span className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#7a7a7a]">{dateLabel}</span>
                                      </div>
                                    )
                                  }
                                  if (!unreadInserted && orgUnreadCount > 0 && !isOwn) {
                                    unreadInserted = true
                                    items.push(
                                      <div key={`unread-${message.id}`} className="flex justify-center">
                                        <span className="rounded-full border border-[#b80f0a] bg-[#fff6f5] px-3 py-1 text-[10px] font-semibold text-[#b80f0a]">Unread</span>
                                      </div>
                                    )
                                  }
                                  items.push(
                                    <div key={message.id} className={`flex items-end gap-2 ${isOwn ? 'justify-end' : ''}`}>
                                      {!isOwn && (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dcdcdc] bg-white text-[11px] font-semibold text-[#4a4a4a]">{initials}</div>
                                      )}
                                      <div className={`group max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isOwn ? 'bg-[#191919] text-white' : 'bg-[#f5f5f5] text-[#191919]'}`}>
                                        <p>{message.body}</p>
                                        {message.attachments && message.attachments.length > 0 ? (
                                          <div className="mt-2 space-y-1 text-xs">
                                            {message.attachments.map((a) => (
                                              <a key={a.url} href={a.url} className="block underline" target="_blank" rel="noreferrer">{a.name}</a>
                                            ))}
                                          </div>
                                        ) : null}
                                        <p className={`mt-1 hidden text-[11px] group-hover:block ${isOwn ? 'text-[#cfcfcf]' : 'text-[#9a9a9a]'}`}>{formatMessageTime(message.created_at)}</p>
                                      </div>
                                      {isOwn && (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] bg-[#191919] text-[11px] font-semibold text-white">{initials}</div>
                                      )}
                                    </div>
                                  )
                                })
                                return items
                              })()}
                            </div>
                            <div className="flex-shrink-0 border-t border-[#f0f0f0] px-5 pb-5 pt-3 space-y-2">
                              {orgInboxAttachment ? (
                                <span className="flex items-center gap-2 rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-1 text-xs text-[#4a4a4a]">
                                  {orgInboxAttachment.name}
                                  <button type="button" onClick={() => setOrgInboxAttachment(null)} className="text-[#b80f0a]">✕</button>
                                </span>
                              ) : null}
                              <div className="flex items-end gap-3 rounded-2xl border border-[#dcdcdc] bg-white px-4 py-3">
                                <textarea
                                  className="flex-1 resize-none bg-transparent text-sm text-[#191919] outline-none placeholder:text-[#9a9a9a]"
                                  rows={3}
                                  placeholder="Reply to this thread"
                                  value={orgInboxDraft}
                                  onChange={(event) => setOrgInboxDraft(event.target.value)}
                                />
                                <label className="flex-shrink-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#dcdcdc] text-[#4a4a4a] hover:border-[#191919]" aria-label="Attach file">
                                  <input type="file" className="hidden" onChange={handleOrgInboxAttachment} />
                                  {orgInboxUploading ? (
                                    <span className="text-[10px] font-semibold">...</span>
                                  ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                      <path d="M8 12.5l5.4-5.4a3 3 0 114.2 4.2l-7.1 7.1a5 5 0 11-7.1-7.1l7.1-7.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </label>
                                <button
                                  type="button"
                                  className="flex-shrink-0 rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9f0d08] transition-colors disabled:opacity-70"
                                  onClick={handleOrgInboxSend}
                                  disabled={orgSending}
                                >
                                  {orgSending ? 'Sending…' : 'Send'}
                                </button>
                              </div>
                              {orgInboxNotice ? <p className="text-xs text-[#4a4a4a]">{orgInboxNotice}</p> : null}
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-1 items-center justify-center">
                            <p className="text-sm text-[#4a4a4a]">Select a thread to view messages.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* Coach-Athlete Messages section */}
              <section className="glass-card border border-[#191919] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[#191919]">Coach-Athlete Messages</h2>
                    <p className="mt-1 text-sm text-[#4a4a4a]">Monitor 1:1 messages between coaches and athletes in your {orgConfig.label.toLowerCase()}.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewThread((prev) => !prev)}
                    className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                  >
                    {showNewThread ? 'Cancel' : 'Start thread'}
                  </button>
                </div>

                {showNewThread && (
                  <div className="mt-4 flex flex-wrap items-end gap-4 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4">
                    <div className="relative flex-1 min-w-[180px]">
                      <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Coach</label>
                      <input
                        value={newCoachQuery}
                        onChange={handleCoachChange}
                        placeholder="Search coaches..."
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      />
                      {coachSuggestions.length > 0 ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 rounded-2xl border border-[#dcdcdc] bg-white p-1 shadow-sm">
                          {coachSuggestions.map((coach) => (
                            <button key={coach.id} type="button" onClick={() => handleCoachPick(coach)} className="flex w-full rounded-xl px-3 py-2 text-left text-sm text-[#191919] hover:bg-[#f5f5f5]">{coach.name}</button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="relative flex-1 min-w-[180px]">
                      <label className="block text-xs font-semibold text-[#4a4a4a] mb-1">Athlete</label>
                      <input
                        value={newAthleteQuery}
                        onChange={handleAthleteChange}
                        placeholder="Search athletes..."
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      />
                      {athleteSuggestions.length > 0 ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 rounded-2xl border border-[#dcdcdc] bg-white p-1 shadow-sm">
                          {athleteSuggestions.map((athlete) => (
                            <button key={athlete.id} type="button" onClick={() => handleAthletePick(athlete)} className="flex w-full rounded-xl px-3 py-2 text-left text-sm text-[#191919] hover:bg-[#f5f5f5]">{athlete.name}</button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleStartThread}
                      className="rounded-full bg-[#191919] px-5 py-2 text-sm font-semibold text-white"
                    >
                      Start
                    </button>
                  </div>
                )}
                {threadNotice ? <p className="mt-2 text-xs text-[#4a4a4a]">{threadNotice}</p> : null}

                <div className="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]">
                  <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                    {threadsLoading ? (
                      <LoadingState label="Loading threads..." />
                    ) : threads.length === 0 ? (
                      <EmptyState title="No threads yet." description="Start a 1:1 thread between a coach and athlete." />
                    ) : (
                      threads.map((thread) => {
                        const isActive = thread.id === selectedThread
                        return (
                          <div
                            key={thread.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedThread(thread.id)}
                            className={`w-full rounded-2xl border px-4 py-3 text-left text-sm transition cursor-pointer ${isActive ? 'border-[#b80f0a] border-l-4 border-l-[#b80f0a] bg-[#fff6f5] shadow-sm' : 'border-[#dcdcdc] border-l-4 border-l-transparent bg-white hover:border-[#b80f0a] hover:border-l-[#b80f0a]'}`}
                          >
                            <p className="font-semibold text-[#191919]">{thread.coach_name} + {thread.athlete_name}</p>
                            <p className="mt-1 truncate text-[11px] text-[#7a7a7a]">{thread.last_message || 'No messages yet.'}</p>
                            <p className="text-[11px] text-[#7a7a7a]">{formatRelativeTime(thread.last_time)}</p>
                          </div>
                        )
                      })
                    )}
                  </div>

                  <div className="flex flex-col rounded-2xl border border-[#dcdcdc] bg-white px-4 py-4 min-h-[200px]">
                    {selectedThread ? (
                      <div className="flex-1 max-h-[360px] overflow-y-auto space-y-3 pr-1">
                        {messages.length === 0 ? (
                          <p className="text-sm text-[#4a4a4a]">No messages in this thread yet.</p>
                        ) : (
                          messages.map((msg) => {
                            const isOwn = msg.sender_id === currentUserId
                            const initials = getInitials(msg.sender_name)
                            return (
                              <div key={msg.id} className={`flex items-end gap-2 ${isOwn ? 'justify-end' : ''}`}>
                                {!isOwn && (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dcdcdc] bg-white text-[11px] font-semibold text-[#4a4a4a]">{initials}</div>
                                )}
                                <div>
                                  {!isOwn && <p className="mb-1 px-1 text-[11px] font-semibold text-[#4a4a4a]">{msg.sender_name}</p>}
                                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm ${isOwn ? 'bg-[#191919] text-white' : 'bg-[#f5f5f5] text-[#191919]'}`}>
                                    {msg.body}
                                  </div>
                                  <p className="mt-1 px-1 text-[11px] text-[#9a9a9a]">{formatMessageTime(msg.created_at)}</p>
                                </div>
                                {isOwn && (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#191919] text-[11px] font-semibold text-white">{initials}</div>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-[#4a4a4a]">Select a thread to view messages.</p>
                    )}
                  </div>
                </div>
              </section>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="glass-card border border-[#191919] bg-white p-6">
                  <h2 className="text-lg font-semibold text-[#191919]">New announcement</h2>
                  <div className="mt-4 grid gap-4 text-sm">
                    {announcementTemplates.length > 0 ? (
                      <label className="space-y-2">
                        <span className="text-xs font-semibold text-[#4a4a4a]">Template</span>
                        <select
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                          value={selectedTemplate}
                          onChange={(event) => handleTemplateSelect(event.target.value)}
                        >
                          <option value="">Choose a template</option>
                          {announcementTemplates.map((template, index) => (
                            <option key={template.title} value={String(index)}>
                              {template.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Title</span>
                      <input
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="e.g., Tryout schedule update"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Audience</span>
                      <select
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        value={audience}
                        onChange={(event) => setAudience(event.target.value)}
                      >
                        {audienceOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-xs font-semibold text-[#4a4a4a]">Message</span>
                      <textarea
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919]"
                        rows={4}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder="Write your update..."
                      />
                    </label>
                    {notice ? <p className="text-xs text-[#4a4a4a]">{notice}</p> : null}
                    <div>
                      <button
                        type="button"
                        className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white"
                        onClick={handleCreate}
                      >
                        Post announcement
                      </button>
                    </div>
                  </div>
                </section>

                <section className="glass-card border border-[#191919] bg-white p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-[#191919]">Recent announcements</h2>
                    <button
                      type="button"
                      className="rounded-full border border-[#191919] px-3 py-1 text-xs font-semibold text-[#191919]"
                      onClick={openAnnouncementsModal}
                    >
                      View all
                    </button>
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    {announcementsLoading ? (
                      <p className="text-xs text-[#4a4a4a]">Loading…</p>
                    ) : visibleAnnouncements.length === 0 ? (
                      <p className="text-xs text-[#4a4a4a]">No announcements yet.</p>
                    ) : visibleAnnouncements.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                        <div className="flex items-center justify-between text-xs text-[#4a4a4a]">
                          <span className="uppercase tracking-[0.2em]">{item.audience}</span>
                          <div className="flex items-center gap-3">
                            {item.total_sent != null && (
                              <span className="rounded-full border border-[#dcdcdc] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">
                                {item.total_read ?? 0} / {item.total_sent} read
                              </span>
                            )}
                            <span>{item.createdAt}</span>
                          </div>
                        </div>
                        <p className="mt-2 font-semibold text-[#191919]">{item.title}</p>
                        <p className="mt-1 text-sm text-[#4a4a4a]">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </main>
      {showAnnouncementsModal && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-3xl rounded-3xl border border-[#191919] bg-white p-6 text-sm text-[#191919] shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Announcements</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#191919]">All announcements</h2>
                <p className="mt-1 text-sm text-[#4a4a4a]">{announcements.length} total</p>
              </div>
              <button
                type="button"
                onClick={closeAnnouncementsModal}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#191919] text-sm font-semibold text-[#191919] hover:bg-[#191919] hover:text-[#b80f0a] transition-colors"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-2">
              {announcements.length === 0 ? (
                <p className="text-xs text-[#4a4a4a]">No announcements yet.</p>
              ) : announcements.map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-[#4a4a4a]">
                    <span className="uppercase tracking-[0.2em]">{item.audience}</span>
                    <div className="flex items-center gap-3">
                      {item.total_sent != null && (
                        <span className="rounded-full border border-[#dcdcdc] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]">
                          {item.total_read ?? 0} / {item.total_sent} read
                        </span>
                      )}
                      <span>{item.createdAt}</span>
                    </div>
                  </div>
                  <p className="mt-2 font-semibold text-[#191919]">{item.title}</p>
                  <p className="mt-1 text-sm text-[#4a4a4a]">{item.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-[#191919] px-4 py-2 text-xs font-semibold text-[#191919]"
                onClick={closeAnnouncementsModal}
              >
                Back to messages
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toastMessage} onClose={() => setToastMessage('')} />
    </>
  )
}

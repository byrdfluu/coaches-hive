'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import AthleteSidebar from '@/components/AthleteSidebar'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import Toast from '@/components/Toast'
import { useAthleteAccess } from '@/components/AthleteAccessProvider'
import { useAthleteProfile } from '@/components/AthleteProfileContext'
import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import type { FormEvent, ChangeEvent, DragEvent } from 'react'

type ThreadItem = {
  id: string
  canonicalThreadId: string
  threadIds: string[]
  name: string
  preview: string
  time: string
  activityAt: string
  unread: boolean
  status: string
  tag?: string
  lastSender?: string
  responseTime?: string
}

type MessageItem = {
  id?: string
  sender: string
  content: string
  createdAt: string
  time: string
  status?: string
  isOwn: boolean
  attachments?: AttachmentItem[]
  deleted?: boolean
  edited?: boolean
}

type MsgSearchResult = {
  message_id: string
  thread_id: string
  thread_name: string
  body_snippet: string
  sender_name: string
  created_at: string
}

type AttachmentItem = {
  url: string
  name: string
  size?: number
  type?: string
  path?: string
}

type SupabaseMessage = {
  id: string
  thread_id: string
  sender_id: string
  body?: string | null
  content?: string | null
  created_at: string
  edited_at?: string | null
  deleted_at?: string | null
}

type SupabaseProfile = {
  id: string
  full_name: string | null
  role: string | null
}

type PersonOption = {
  id: string
  name: string
}

type LookupSuggestion = {
  id: string
  label: string
  type: 'user'
  role?: string | null
}

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const deslugify = (slug: string) => slug.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
const MESSAGE_PAGE_SIZE = 8
const MESSAGE_LOAD_MORE_THRESHOLD = 72

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
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const mergeMessageFeed = (existing: MessageItem[], incoming: MessageItem[]) => {
  const byId = new Map<string, MessageItem>()

  ;[...existing, ...incoming].forEach((message) => {
    const key = message.id || `${message.createdAt}-${message.sender}-${message.content}`
    byId.set(key, message)
  })

  return Array.from(byId.values()).sort((a, b) => {
    const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    if (timeDiff !== 0) return timeDiff
    return String(a.id || '').localeCompare(String(b.id || ''))
  })
}

export default function AthleteMessagesPage() {
  const supabase = useMemo(() => createClientComponentClient(), [])
  const searchParams = useSearchParams()
  const router = useRouter()
  const { needsGuardianApproval, isGuardian } = useAthleteAccess()
  const { activeAthleteLabel, activeSubProfileId, setActiveSubProfileId } = useAthleteProfile()
  const guardianGateActive = needsGuardianApproval && !isGuardian
  const requestedThread = searchParams?.get('thread') || ''
  const requestedConversationId = searchParams?.get('conversation_id') || searchParams?.get('thread_id') || ''
  const requestedNew = searchParams?.get('new') || ''
  const requestedSubProfileId = searchParams?.get('athlete_profile_id') || searchParams?.get('sub_profile_id') || ''
  const [filter, setFilter] = useState<'all' | 'unread' | 'coaches' | 'archived' | 'blocked'>('all')
  const [search, setSearch] = useState('')
  const [threadList, setThreadList] = useState<ThreadItem[]>([])
  const [activeMessages, setActiveMessages] = useState<MessageItem[]>([])
  const [activeConversationName, setActiveConversationName] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [showThreadDrawer, setShowThreadDrawer] = useState(false)
  const [showDetailsPanel, setShowDetailsPanel] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [draftMessage, setDraftMessage] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentItem | null>(null)
  const [attachmentUploading, setAttachmentUploading] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [selectedRecipientId, setSelectedRecipientId] = useState('')
  const [selectedRecipientRole, setSelectedRecipientRole] = useState<string | null>(null)
  const [lookupSuggestions, setLookupSuggestions] = useState<LookupSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [coachOptions, setCoachOptions] = useState<PersonOption[]>([])
  const [approvedCoachIds, setApprovedCoachIds] = useState<string[]>([])
  const [composerNotice, setComposerNotice] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messagePaneRef = useRef<HTMLDivElement | null>(null)
  const [toastMessage, setToastMessage] = useState('')
  const [mutedThreadIds, setMutedThreadIds] = useState<string[]>([])
  const [archivedThreadIds, setArchivedThreadIds] = useState<string[]>([])
  const [blockedThreadIds, setBlockedThreadIds] = useState<string[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [typingName, setTypingName] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const [msgSearchMode, setMsgSearchMode] = useState(false)
  const [msgSearchQuery, setMsgSearchQuery] = useState('')
  const [msgSearchResults, setMsgSearchResults] = useState<MsgSearchResult[]>([])
  const [msgSearchLoading, setMsgSearchLoading] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editBodyDraft, setEditBodyDraft] = useState('')
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const [oldestMessageAt, setOldestMessageAt] = useState<string | null>(null)
  const activeConversationKeyRef = useRef('')
  const scrollModeRef = useRef<'bottom' | 'preserve' | null>(null)
  const preservedScrollHeightRef = useRef(0)
  const preservedScrollTopRef = useRef(0)

  // Debounced message content search.
  useEffect(() => {
    if (!msgSearchMode || msgSearchQuery.length < 2) {
      setMsgSearchResults([])
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setMsgSearchLoading(true)
      try {
        const res = await fetch(`/api/messages/search?q=${encodeURIComponent(msgSearchQuery)}`, { signal: controller.signal })
        if (!res.ok) return
        const payload = await res.json().catch(() => ({}))
        setMsgSearchResults((payload.results || []) as MsgSearchResult[])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Unable to search messages.', error)
        }
      } finally {
        setMsgSearchLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timeout)
      if (!controller.signal.aborted) controller.abort()
    }
  }, [msgSearchMode, msgSearchQuery])

  const handleEditSave = useCallback(async (messageId: string) => {
    const newBody = editBodyDraft.trim()
    if (!newBody) return
    const res = await fetch(`/api/messages/${messageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: newBody }),
    })
    if (res.ok) {
      setActiveMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newBody, edited: true } : m))
      )
    } else {
      setToastMessage('Unable to edit message. Please try again.')
    }
    setEditingMessageId(null)
    setEditBodyDraft('')
  }, [editBodyDraft])

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    const res = await fetch(`/api/messages/${messageId}`, { method: 'DELETE' })
    if (res.ok) {
      setActiveMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: '', deleted: true } : m))
      )
    } else {
      setToastMessage('Unable to delete message. Please try again.')
    }
  }, [])

  const showToast = useCallback((message: string) => {
    setToastMessage(message)
  }, [])

  useEffect(() => {
    let mounted = true
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) {
        setCurrentUserId(data.user?.id ?? null)
      }
    }
    loadUser()
    return () => {
      mounted = false
    }
  }, [supabase])

  useEffect(() => {
    if (!currentUserId) return
    let active = true
    const loadCoachOptions = async () => {
      const res = await fetch('/api/memberships')
      if (!res.ok || !active) return
      const payload = await res.json().catch(() => ({}))
      const links = (payload.links || []) as Array<{
        coach_profile?: { id: string; full_name?: string | null } | null
      }>
      const coachList = links
        .filter((link) => link.coach_profile?.id)
        .map((link) => ({
          id: link.coach_profile!.id,
          name: link.coach_profile!.full_name || 'Coach',
        }))
      setCoachOptions(coachList)
    }
    loadCoachOptions()
    return () => {
      active = false
    }
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) return
    let active = true
    const loadApprovals = async () => {
      const { data } = await supabase
        .from('guardian_approvals')
        .select('target_type, target_id, status, scope')
        .eq('athlete_id', currentUserId)
        .eq('status', 'approved')
        .eq('scope', 'messages')
      if (!active) return
      const coaches: string[] = []
      const approvalRows = (data || []) as Array<{ target_type?: string | null; target_id?: string | null }>
      approvalRows.forEach((row) => {
        if (!row.target_id) return
        if (row.target_type === 'coach') coaches.push(row.target_id)
      })
      setApprovedCoachIds(coaches)
    }
    loadApprovals()
    return () => {
      active = false
    }
  }, [currentUserId, supabase])

  useEffect(() => {
    const query = newName.trim()
    if (!query) {
      setLookupSuggestions([])
      setLookupLoading(false)
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(async () => {
      setLookupLoading(true)
      try {
        const response = await fetch(
          `/api/messages/lookup?query=${encodeURIComponent(query)}&types=user`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          setLookupSuggestions([])
          return
        }
        const payload = await response.json().catch(() => ({}))
        const matches = ((payload.results || []) as LookupSuggestion[])
          .filter((suggestion) => suggestion.type === 'user')
          .filter((suggestion) => ['coach', 'athlete'].includes(String(suggestion.role || '').toLowerCase()))
          .slice(0, 6)
        setLookupSuggestions(matches)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Unable to search recipients.', error)
          setLookupSuggestions([])
        }
      } finally {
        setLookupLoading(false)
      }
    }, 180)

    return () => {
      clearTimeout(timeout)
      if (!controller.signal.aborted) controller.abort()
      setLookupLoading(false)
    }
  }, [newName])

  const matchingSuggestions = useMemo(() => {
    const query = newName.trim().toLowerCase()
    if (!query) return []
    return lookupSuggestions
      .filter((suggestion) => suggestion.label.toLowerCase().includes(query))
      .slice(0, 6)
  }, [lookupSuggestions, newName])

  const allowedRecipientIds = useMemo(
    () =>
      new Set([
        ...coachOptions.map((person) => person.id),
        ...approvedCoachIds,
      ]),
    [approvedCoachIds, coachOptions]
  )

  const handleRecipientChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setNewName(value)
      setShowSuggestions(Boolean(value.trim()))
      setComposerNotice('')
      setSelectedRecipientId('')
      setSelectedRecipientRole(null)
    },
    []
  )

  const handleSuggestionPick = useCallback((suggestion: LookupSuggestion) => {
    setNewName(suggestion.label)
    setShowSuggestions(false)
    setComposerNotice('')
    setSelectedRecipientId(suggestion.id)
    setSelectedRecipientRole(suggestion.role || null)
  }, [])

  const isSelectionAllowed = useMemo(() => {
    if (!guardianGateActive) return true
    if (selectedRecipientId) return allowedRecipientIds.has(selectedRecipientId)
    return false
  }, [
    allowedRecipientIds,
    guardianGateActive,
    selectedRecipientId,
  ])

  const requestGuardianApproval = useCallback(
    async (payload: { target_type: 'coach'; target_id: string; target_label: string }) => {
      const response = await fetch('/api/guardian-approvals/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, scope: 'messages' }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setComposerNotice(data?.error || 'Unable to request guardian approval.')
        return false
      }
      setComposerNotice('Guardian approval requested. We notified your parent/guardian.')
      return true
    },
    []
  )

  const resolveSelectedRecipient = useCallback(() => {
    if (selectedRecipientId) {
      const selectedSuggestion = lookupSuggestions.find((suggestion) => suggestion.id === selectedRecipientId)
      if (selectedSuggestion) {
        return {
          id: selectedSuggestion.id,
          name: selectedSuggestion.label,
          role: String(selectedSuggestion.role || selectedRecipientRole || '').toLowerCase() || null,
        }
      }
      const selectedCoach = coachOptions.find((coach) => coach.id === selectedRecipientId)
      if (selectedCoach) {
        return {
          id: selectedCoach.id,
          name: selectedCoach.name,
          role: 'coach',
        }
      }
    }
    const normalizedName = newName.trim().toLowerCase()
    if (!normalizedName) return null
    const exactSuggestion = lookupSuggestions.find(
      (suggestion) => suggestion.label.trim().toLowerCase() === normalizedName,
    )
    if (exactSuggestion) {
      return {
        id: exactSuggestion.id,
        name: exactSuggestion.label,
        role: String(exactSuggestion.role || '').toLowerCase() || null,
      }
    }
    const exactCoach = coachOptions.find((coach) => coach.name.trim().toLowerCase() === normalizedName)
    if (exactCoach) {
      return {
        id: exactCoach.id,
        name: exactCoach.name,
        role: 'coach',
      }
    }
    return null
  }, [coachOptions, lookupSuggestions, newName, selectedRecipientId, selectedRecipientRole])

  const uploadAttachment = useCallback(async (file: File) => {
    setAttachmentUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/api/storage/attachment', {
      method: 'POST',
      body: formData,
    })
    if (response.ok) {
      const data = await response.json()
      setPendingAttachment({
        url: data.url,
        name: data.name,
        size: data.size,
        type: data.type,
        path: data.path,
      })
    } else {
      showToast('Unable to upload attachment.')
    }
    setAttachmentUploading(false)
  }, [showToast])

  const handleAttachmentSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      await uploadAttachment(file)
      event.target.value = ''
    },
    [uploadAttachment]
  )

  const handleDropAttachment = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDragActive(false)
      const file = event.dataTransfer.files?.[0]
      if (!file) return
      await uploadAttachment(file)
    },
    [uploadAttachment]
  )

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragActive(false)
  }, [])

  const markMessagesRead = useCallback(
    async (messages: SupabaseMessage[]) => {
      if (!currentUserId) return
      const ids = messages
        .filter((message) => message.sender_id !== currentUserId)
        .map((message) => message.id)

      if (ids.length === 0) return

      await fetch('/api/messages/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_ids: ids, receipt: 'read' }),
      })
    },
    [currentUserId]
  )

  const markMessagesDelivered = useCallback(
    async (messages: SupabaseMessage[]) => {
      if (!currentUserId) return
      const ids = messages
        .filter((message) => message.sender_id !== currentUserId)
        .map((message) => message.id)

      if (ids.length === 0) return

      await fetch('/api/messages/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_ids: ids, receipt: 'delivered' }),
      })
    },
    [currentUserId]
  )

  const markThreadRead = useCallback(
    async (thread: ThreadItem) => {
      setThreadList((prev) => prev.map((item) => (item.id === thread.id ? { ...item, unread: false } : item)))
      if (!currentUserId) return
      const { data: messages } = await supabase
        .from('messages')
        .select('id, sender_id')
        .in('thread_id', thread.threadIds)
      const ids = (messages || [])
        .filter((message) => message.sender_id !== currentUserId)
        .map((message) => message.id)
      if (ids.length === 0) return
      await fetch('/api/messages/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_ids: ids, receipt: 'read' }),
      })
    },
    [currentUserId, supabase]
  )

  const updateThreadPreference = useCallback(
    async (thread: ThreadItem, action: string) => {
      const response = await fetch('/api/messages/thread-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: thread.canonicalThreadId,
          thread_ids: thread.threadIds,
          action,
        }),
      })
      return response.ok
    },
    []
  )

  const toggleMuteThread = useCallback(
    async (thread: ThreadItem) => {
      const isMuted = mutedThreadIds.includes(thread.id)
      const action = isMuted ? 'unmute' : 'mute'
      const ok = await updateThreadPreference(thread, action)
      if (!ok) {
        showToast('Unable to update thread.')
        return
      }
      setMutedThreadIds((prev) => {
        const next = isMuted ? prev.filter((id) => id !== thread.id) : [...prev, thread.id]
        showToast(isMuted ? 'Thread unmuted.' : 'Thread muted.')
        return next
      })
    },
    [mutedThreadIds, showToast, updateThreadPreference]
  )

  const archiveThread = useCallback(
    async (thread: ThreadItem) => {
      const ok = await updateThreadPreference(thread, 'archive')
      if (!ok) {
        showToast('Unable to archive thread.')
        return
      }
      setArchivedThreadIds((prev) => [...prev, thread.id])
      showToast('Thread archived.')
    },
    [showToast, updateThreadPreference]
  )

  const unarchiveThread = useCallback(
    async (thread: ThreadItem) => {
      const ok = await updateThreadPreference(thread, 'unarchive')
      if (!ok) {
        showToast('Unable to unarchive thread.')
        return
      }
      setArchivedThreadIds((prev) => prev.filter((id) => id !== thread.id))
      showToast('Thread restored.')
    },
    [showToast, updateThreadPreference]
  )

  const blockThread = useCallback(
    async (thread: ThreadItem) => {
      const ok = await updateThreadPreference(thread, 'block')
      if (!ok) {
        showToast('Unable to block thread.')
        return
      }
      setBlockedThreadIds((prev) => [...prev, thread.id])
      showToast('Thread blocked.')
    },
    [showToast, updateThreadPreference]
  )

  const unblockThread = useCallback(
    async (thread: ThreadItem) => {
      const ok = await updateThreadPreference(thread, 'unblock')
      if (!ok) {
        showToast('Unable to unblock thread.')
        return
      }
      setBlockedThreadIds((prev) => prev.filter((id) => id !== thread.id))
      showToast('Thread unblocked.')
    },
    [showToast, updateThreadPreference]
  )

  const loadThreads = useCallback(async () => {
    if (!currentUserId) return
    setLoadingThreads(true)
    const params = new URLSearchParams({
      athlete_context_key: activeSubProfileId || 'main',
      athlete_context_label: activeAthleteLabel,
    })
    const response = await fetch(`/api/messages/inbox?${params.toString()}`, { cache: 'no-store' }).catch(() => null)
    if (!response?.ok) {
      setThreadList([])
      setMutedThreadIds([])
      setArchivedThreadIds([])
      setBlockedThreadIds([])
      setLoadingThreads(false)
      return
    }
    const payload = await response.json().catch(() => null)
    const nextThreads = ((payload?.threads || []) as Array<ThreadItem & {
      canonical_thread_id?: string
      thread_ids?: string[]
    }>)
      .filter((thread) => Boolean(thread.id))
      .map((thread) => ({
        ...thread,
        canonicalThreadId: thread.canonicalThreadId || thread.canonical_thread_id || thread.id,
        threadIds: thread.threadIds || thread.thread_ids || [thread.canonicalThreadId || thread.canonical_thread_id || thread.id],
      }))
    setThreadList(nextThreads)
    setMutedThreadIds((payload?.muted_thread_ids || []) as string[])
    setArchivedThreadIds((payload?.archived_thread_ids || []) as string[])
    setBlockedThreadIds((payload?.blocked_thread_ids || []) as string[])
    setLoadingThreads(false)
  }, [activeAthleteLabel, activeSubProfileId, currentUserId])

  const loadMessages = useCallback(
    async (
      threadIds: string[],
      options?: {
        before?: string | null
        mode?: 'replace' | 'prepend' | 'merge'
        scroll?: 'bottom' | 'preserve' | 'none'
      },
    ) => {
      if (!currentUserId || threadIds.length === 0) return
      const { before = null, mode = 'replace', scroll = 'none' } = options || {}
      const params = new URLSearchParams()
      params.set('thread_ids', threadIds.join(','))
      params.set('limit', String(MESSAGE_PAGE_SIZE))
      if (before) params.set('before', before)
      const conversationKey = threadIds.join(',')

      const response = await fetch(
        `/api/messages/conversation?${params.toString()}`,
        { cache: 'no-store' },
      ).catch(() => null)

      if (!response?.ok) {
        if (mode === 'prepend') setLoadingOlderMessages(false)
        showToast('Unable to load messages.')
        return
      }

      const payload = await response.json().catch(() => ({}))
      if (activeConversationKeyRef.current !== conversationKey) {
        if (mode === 'prepend') setLoadingOlderMessages(false)
        return
      }

      const participantNames = ((payload.participants || []) as Array<{ name?: string | null }>)
        .map((participant) => String(participant.name || '').trim())
        .filter(Boolean)
      const conversationName = participantNames.join(', ')
      setActiveConversationName(conversationName)

      const threadMessages = ((payload.messages || []) as Array<{
        id: string
        thread_id: string
        sender_id: string
        sender_name: string
        content: string
        created_at: string
        edited_at?: string | null
        deleted_at?: string | null
        attachments?: AttachmentItem[]
        status?: string | null
      }>).map((message) => ({
        id: message.id,
        thread_id: message.thread_id,
        sender_id: message.sender_id,
        body: message.content,
        created_at: message.created_at,
        edited_at: message.edited_at || null,
        deleted_at: message.deleted_at || null,
      })) as SupabaseMessage[]

      const feed = ((payload.messages || []) as Array<{
        id: string
        sender_id: string
        sender_name: string
        content: string
        created_at: string
        edited_at?: string | null
        deleted_at?: string | null
        attachments?: AttachmentItem[]
        status?: string | null
      }>).map((message) => ({
        id: message.id,
        sender: message.sender_name || 'Participant',
        content: message.content || '',
        createdAt: message.created_at,
        time: formatMessageTime(message.created_at),
        status: message.status || undefined,
        isOwn: message.sender_id === currentUserId,
        attachments: message.attachments || [],
        deleted: !!message.deleted_at,
        edited: !!message.edited_at,
      }))

      if (conversationName) {
        setThreadList((prev) =>
          prev.map((thread) =>
            thread.threadIds.some((threadId) => threadIds.includes(threadId))
              ? { ...thread, name: conversationName }
              : thread,
          ),
        )
      }

      if (scroll !== 'none') {
        scrollModeRef.current = scroll
      }

      if (mode === 'replace') {
        setActiveMessages(feed)
        setHasOlderMessages(Boolean(payload.has_more))
        setOldestMessageAt(feed[0]?.createdAt || null)
      } else if (mode === 'prepend') {
        setActiveMessages((prev) => mergeMessageFeed(prev, feed))
        setHasOlderMessages(Boolean(payload.has_more))
        setOldestMessageAt((prev) => feed[0]?.createdAt || prev || null)
        setLoadingOlderMessages(false)
      } else {
        setActiveMessages((prev) => mergeMessageFeed(prev, feed))
        setHasOlderMessages((prev) => prev || Boolean(payload.has_more))
        setOldestMessageAt((prev) => {
          const incomingOldest = feed[0]?.createdAt || null
          if (!prev) return incomingOldest
          if (!incomingOldest) return prev
          return new Date(incomingOldest).getTime() < new Date(prev).getTime() ? incomingOldest : prev
        })
      }

      await markMessagesDelivered(threadMessages)
      await markMessagesRead(threadMessages)
    },
    [currentUserId, markMessagesDelivered, markMessagesRead, showToast]
  )

  useEffect(() => {
    if (!currentUserId) return
    loadThreads()
  }, [currentUserId, loadThreads])

  const scopedThreads = useMemo(() => {
    if (filter === 'archived') {
      return threadList.filter((t) => archivedThreadIds.includes(t.id))
    }
    if (filter === 'blocked') {
      return threadList.filter((t) => blockedThreadIds.includes(t.id))
    }
    return threadList.filter((t) => !archivedThreadIds.includes(t.id) && !blockedThreadIds.includes(t.id))
  }, [archivedThreadIds, blockedThreadIds, filter, threadList])

  const slugs = useMemo(() => scopedThreads.map((t) => slugify(t.name)), [scopedThreads])
  const activeSlug = useMemo(() => {
    if (requestedConversationId) {
      const thread = scopedThreads.find(
        (candidate) =>
          candidate.id === requestedConversationId ||
          candidate.canonicalThreadId === requestedConversationId ||
          candidate.threadIds.includes(requestedConversationId),
      )
      if (thread) return slugify(thread.name)
    }
    if (requestedThread && slugs.includes(requestedThread)) return requestedThread
    return slugs[0] || ''
  }, [requestedConversationId, requestedThread, scopedThreads, slugs])

  const filteredThreads = useMemo(() => {
    return scopedThreads.filter((t) => {
      if (filter === 'unread' && !t.unread) return false
      if (filter === 'coaches' && t.tag !== 'Coach') return false
      const q = search.trim().toLowerCase()
      if (q && !(`${t.name} ${t.preview} ${t.tag || ''} ${t.lastSender || ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [filter, search, scopedThreads])

  const activeThread = scopedThreads.find((t) => slugify(t.name) === activeSlug) || scopedThreads[0]
  const activeName = activeConversationName || activeThread?.name || ''
  const activeThreadId = activeThread?.canonicalThreadId || ''
  const activeThreadIds = useMemo(() => activeThread?.threadIds || [], [activeThread])
  const activeConversationKey = activeThreadIds.join(',')
  const unreadThreads = useMemo(() => filteredThreads.filter((thread) => thread.unread), [filteredThreads])
  const unreadCount = unreadThreads.length
  const archivedCount = useMemo(
    () => threadList.filter((thread) => archivedThreadIds.includes(thread.id)).length,
    [archivedThreadIds, threadList]
  )
  const blockedCount = useMemo(
    () => threadList.filter((thread) => blockedThreadIds.includes(thread.id)).length,
    [blockedThreadIds, threadList]
  )
  const recentThreads = useMemo(() => threadList.slice(0, 3), [threadList])
  const detailParticipants = useMemo(() => {
    const seen = new Set<string>()
    const participants = activeMessages
      .filter((message) => !message.isOwn && !message.deleted)
      .map((message) => message.sender)
      .filter((name) => {
        const normalized = name.trim()
        if (!normalized || seen.has(normalized)) return false
        seen.add(normalized)
        return true
      })
      .map((name, index) => ({
        id: `${slugify(name)}-${index}`,
        name,
        status: 'Active',
      }))

    if (participants.length > 0) return participants
    if (activeName) {
      return [{ id: slugify(activeName), name: activeName, status: 'Active' }]
    }
    return []
  }, [activeMessages, activeName])
  const detailAttachments = useMemo(
    () =>
      activeMessages
        .flatMap((message) => message.attachments || [])
        .map((attachment, index) => ({
          id: `${attachment.url}-${index}`,
          name: attachment.name || 'Attachment',
          url: attachment.url,
        })),
    [activeMessages],
  )

  useEffect(() => {
    activeConversationKeyRef.current = activeConversationKey
  }, [activeConversationKey])

  useEffect(() => {
    if (!currentUserId) return
    const channel = supabase
      .channel(`thread-participants-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'thread_participants', filter: `user_id=eq.${currentUserId}` },
        () => loadThreads()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, loadThreads, supabase])

  useEffect(() => {
    if (!currentUserId || threadList.length === 0) return
    const threadIds = Array.from(new Set(threadList.flatMap((thread) => thread.threadIds)))
    if (threadIds.length === 0) return

    const channel = supabase
      .channel(`messages-inbox-${currentUserId}-${threadIds.length}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=in.(${threadIds.join(',')})`,
        },
        (payload) => {
          const newMessage = payload.new as SupabaseMessage
          if (newMessage?.id) {
            markMessagesDelivered([newMessage])
          }
          if (newMessage?.thread_id && activeThreadIds.includes(newMessage.thread_id)) {
            loadMessages(activeThreadIds, { mode: 'merge', scroll: 'bottom' })
          }
          loadThreads()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [
    activeThreadId,
    activeThreadIds,
    currentUserId,
    loadMessages,
    loadThreads,
    markMessagesDelivered,
    supabase,
    threadList,
  ])

  useEffect(() => {
    if (requestedSubProfileId) {
      setActiveSubProfileId(requestedSubProfileId)
    }
  }, [requestedSubProfileId, setActiveSubProfileId])

  useEffect(() => {
    if (requestedNew) {
      setShowComposer(true)
      setNewName(deslugify(requestedNew))
      const linkedCoach = coachOptions.find(
        (coach) => slugify(coach.name) === requestedNew || coach.name.toLowerCase() === deslugify(requestedNew).toLowerCase()
      )
      if (linkedCoach) {
        setNewName(linkedCoach.name)
        setSelectedRecipientId(linkedCoach.id)
        setSelectedRecipientRole('coach')
      }
    }
  }, [coachOptions, requestedNew])

  useEffect(() => {
    if (!activeThreadId) {
      setActiveMessages([])
      setActiveConversationName('')
      setHasOlderMessages(false)
      setLoadingOlderMessages(false)
      setOldestMessageAt(null)
      return
    }
    loadMessages(activeThreadIds, { mode: 'replace', scroll: 'bottom' })
  }, [activeThreadId, activeThreadIds, loadMessages])

  useLayoutEffect(() => {
    const pane = messagePaneRef.current
    if (!pane) return
    if (scrollModeRef.current === 'bottom') {
      pane.scrollTop = pane.scrollHeight
    } else if (scrollModeRef.current === 'preserve') {
      pane.scrollTop = preservedScrollTopRef.current + (pane.scrollHeight - preservedScrollHeightRef.current)
    }
    scrollModeRef.current = null
    preservedScrollHeightRef.current = 0
    preservedScrollTopRef.current = 0
  }, [activeThreadId, activeMessages])

  const loadOlderMessages = useCallback(async () => {
    const pane = messagePaneRef.current
    if (!pane || loadingOlderMessages || !hasOlderMessages || !oldestMessageAt || activeThreadIds.length === 0) return
    preservedScrollHeightRef.current = pane.scrollHeight
    preservedScrollTopRef.current = pane.scrollTop
    setLoadingOlderMessages(true)
    await loadMessages(activeThreadIds, {
      before: oldestMessageAt,
      mode: 'prepend',
      scroll: 'preserve',
    })
  }, [activeThreadIds, hasOlderMessages, loadMessages, loadingOlderMessages, oldestMessageAt])

  const handleMessagePaneScroll = useCallback(() => {
    const pane = messagePaneRef.current
    if (!pane || loadingOlderMessages || !hasOlderMessages) return
    if (pane.scrollTop <= MESSAGE_LOAD_MORE_THRESHOLD) {
      void loadOlderMessages()
    }
  }, [hasOlderMessages, loadOlderMessages, loadingOlderMessages])


  const onSelectThread = useCallback(
    (slug: string, conversationId?: string) => {
      const params = new URLSearchParams()
      params.set('thread', slug)
      if (conversationId) params.set('conversation_id', conversationId)
      router.push(`?${params.toString()}`)
    },
    [router]
  )

  useEffect(() => {
    if (filteredThreads.length === 0) return
    // If we're navigating to a specific thread by ID, don't redirect away until
    // we know for sure that thread doesn't exist (it may not be in state yet).
    if (
      requestedConversationId &&
      !filteredThreads.some(
        (t) =>
          t.id === requestedConversationId ||
          t.canonicalThreadId === requestedConversationId ||
          t.threadIds.includes(requestedConversationId),
      )
    ) return
    const hasActive = filteredThreads.some(
      (thread) =>
        thread.id === requestedConversationId ||
        thread.canonicalThreadId === requestedConversationId ||
        thread.threadIds.includes(requestedConversationId) ||
        slugify(thread.name) === activeSlug
    )
    if (!hasActive) {
      onSelectThread(slugify(filteredThreads[0].name), filteredThreads[0].id)
    }
  }, [activeSlug, filteredThreads, onSelectThread, requestedConversationId])

  const handleKeyNav = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = filteredThreads.findIndex((t) => slugify(t.name) === activeSlug)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = filteredThreads[(currentIndex + 1) % filteredThreads.length]
        next && onSelectThread(slugify(next.name), next.id)
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prevIndex = (currentIndex - 1 + filteredThreads.length) % filteredThreads.length
        const prev = filteredThreads[prevIndex]
        prev && onSelectThread(slugify(prev.name), prev.id)
      }
    },
    [activeSlug, filteredThreads, onSelectThread]
  )

  const handleNewMessage = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const content = newMessage.trim()
      if (!content || !currentUserId) return

      const selectedRecipient = resolveSelectedRecipient()
      if (!selectedRecipient) {
        setComposerNotice('Pick a coach or athlete from the suggestions to continue.')
        return
      }

      const isCoachRecipient = selectedRecipient.role === 'coach'

      if (guardianGateActive && isCoachRecipient && !isSelectionAllowed) {
        await requestGuardianApproval({
          target_type: 'coach',
          target_id: selectedRecipient.id,
          target_label: selectedRecipient.name,
        })
        return
      }

      if (guardianGateActive && isCoachRecipient && !allowedRecipientIds.has(selectedRecipient.id)) {
        await requestGuardianApproval({
          target_type: 'coach',
          target_id: selectedRecipient.id,
          target_label: selectedRecipient.name,
        })
        return
      }

      let response: Response
      const firstMessage = `[Athlete context: ${activeAthleteLabel}]\n${content}`
      try {
        response = await fetch('/api/messages/thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: selectedRecipient.name,
            is_group: false,
            participant_ids: [selectedRecipient.id],
            athlete_context_key: activeSubProfileId || 'main',
            athlete_context_label: activeAthleteLabel,
            first_message: firstMessage,
          }),
        })
      } catch {
        setComposerNotice('Unable to start thread. Check your connection.')
        return
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setComposerNotice(payload?.error || 'Unable to start thread.')
        return
      }

      const payload = await response.json().catch(() => ({}))
      const nextTitle = payload.title || selectedRecipient.name

      setNewName('')
      setSelectedRecipientId('')
      setSelectedRecipientRole(null)
      setNewMessage('')
      setComposerNotice('')
      setShowComposer(false)
      await loadThreads()
      onSelectThread(slugify(nextTitle), payload.conversation_id || payload.thread_id)
    },
    [
      allowedRecipientIds,
      currentUserId,
      guardianGateActive,
      activeAthleteLabel,
      activeSubProfileId,
      isSelectionAllowed,
      loadThreads,
      newMessage,
      onSelectThread,
      requestGuardianApproval,
      resolveSelectedRecipient,
    ]
  )

  const attachFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleSendMessage = useCallback(async () => {
    const content = draftMessage.trim()
    if ((!content && !pendingAttachment) || !activeThreadId || !currentUserId) return

    let response: Response
    try {
      response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: activeThreadId,
          body: content,
          attachment: pendingAttachment,
        }),
      })
    } catch {
      showToast('Unable to send message. Check your connection.')
      return
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      showToast(payload?.error || 'Unable to send message.')
      return
    }

    setDraftMessage('')
    setPendingAttachment(null)
    await loadMessages(activeThreadIds, { mode: 'merge', scroll: 'bottom' })
    await loadThreads()
  }, [activeThreadId, activeThreadIds, currentUserId, draftMessage, loadMessages, loadThreads, pendingAttachment, showToast])

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-10">
        <RoleInfoBanner role="athlete" />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Messaging</p>
            <h1 className="display text-3xl font-semibold text-[#191919]">Stay synced with your coaches.</h1>
            <p className="mt-2 text-sm text-[#4a4a4a]">
              Search, filter, and jump into the right thread without losing context.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 text-sm sm:w-auto sm:flex-row sm:flex-wrap">
            <Link className="rounded-full border border-[#191919] px-4 py-2 font-semibold text-[#191919]" href="/athlete/discover">
              View coaches
            </Link>
            <button
              className="rounded-full bg-[#b80f0a] px-4 py-2 font-semibold text-white"
              onClick={() => setShowComposer((s) => !s)}
            >
              New message
            </button>
          </div>
        </header>
        <div className="mt-5 grid min-w-0 items-start gap-6 lg:grid-cols-[200px_1fr]">
          <AthleteSidebar />
          <div className="min-w-0">
            <section className="relative grid min-h-[calc(100svh-11.5rem)] min-w-0 gap-5 md:min-h-[calc(100svh-10rem)] lg:min-h-[520px] lg:h-[calc(100vh-260px)] lg:grid-cols-[1fr_1.4fr]">
              {showThreadDrawer && (
                <button
                  type="button"
                  className="fixed inset-0 z-[300] bg-[#191919]/35 lg:hidden"
                  onClick={() => setShowThreadDrawer(false)}
                  aria-label="Close panel"
                />
              )}
              <div className={`glass-card flex min-h-0 min-w-0 flex-col overflow-hidden border border-[#191919] bg-white p-3 sm:p-4 ${showThreadDrawer ? 'absolute inset-0 z-[400] h-full w-full shadow-xl lg:relative lg:inset-auto lg:z-auto lg:w-auto lg:shadow-none' : 'hidden lg:flex'}`}>
                <div className="sticky top-0 z-10 -mx-4 bg-white px-4 pb-3 pt-1">
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
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or topic"
                        className="w-full min-w-0 flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919] md:min-w-[200px]"
                      />
                      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:w-auto">
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          className="w-full whitespace-nowrap rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold text-[#191919] transition-colors hover:text-[#b80f0a] md:w-auto"
                        >
                          Clear search
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMsgSearchMode((v) => !v); setMsgSearchQuery(''); setMsgSearchResults([]) }}
                          className={`w-full whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition-colors md:w-auto ${msgSearchMode ? 'border-[#b80f0a] bg-[#b80f0a] text-white' : 'border-[#191919] text-[#191919] hover:text-[#b80f0a]'}`}
                        >
                          Search messages
                        </button>
                      </div>
                    </div>
                    {msgSearchMode && (
                      <div className="flex flex-col gap-2">
                        <input
                          type="search"
                          value={msgSearchQuery}
                          onChange={(e) => setMsgSearchQuery(e.target.value)}
                          placeholder="Search message content…"
                          autoFocus
                          className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                        />
                        {msgSearchLoading && <p className="text-xs text-[#4a4a4a]">Searching…</p>}
                        {!msgSearchLoading && msgSearchResults.length > 0 && (
                          <div className="max-h-[260px] overflow-y-auto space-y-2">
                            {msgSearchResults.map((r) => (
                              <button
                                key={r.message_id}
                                type="button"
                                onClick={() => {
                                  const match = threadList.find(
                                    (t) => t.id === r.thread_id || t.canonicalThreadId === r.thread_id || t.threadIds.includes(r.thread_id),
                                  )
                                  if (match) {
                                    router.push(`?thread=${slugify(match.name)}&conversation_id=${encodeURIComponent(match.id)}`)
                                    setTimeout(() => {
                                      document.getElementById(r.message_id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                    }, 400)
                                  }
                                  setMsgSearchMode(false)
                                  setMsgSearchQuery('')
                                  setMsgSearchResults([])
                                }}
                                className="w-full rounded-xl border border-[#dcdcdc] bg-[#f5f5f5] p-3 text-left hover:border-[#191919]"
                              >
                                <p className="text-xs font-semibold text-[#191919]">{r.thread_name} · <span className="font-normal text-[#4a4a4a]">{r.sender_name}</span></p>
                                <p className="mt-0.5 text-xs text-[#4a4a4a] line-clamp-2">{r.body_snippet}</p>
                              </button>
                            ))}
                          </div>
                        )}
                        {!msgSearchLoading && msgSearchQuery.length >= 2 && msgSearchResults.length === 0 && (
                          <p className="text-xs text-[#4a4a4a]">No results found.</p>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#191919]">
                      {[
                        { key: 'all', label: 'All' },
                        { key: 'unread', label: `Unread (${unreadCount})` },
                        { key: 'coaches', label: 'Coaches' },
                        { key: 'archived', label: `Archived (${archivedCount})` },
                        { key: 'blocked', label: `Blocked (${blockedCount})` },
                      ].map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setFilter(f.key as typeof filter)}
                          className={`rounded-full border px-3 py-1 transition ${
                            filter === f.key ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#dcdcdc] bg-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {false && (
                  <form onSubmit={handleNewMessage} className="mt-1 flex-shrink-0 space-y-2.5 rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] p-4 text-sm">
                    {guardianGateActive ? (
                      <div className="rounded-xl border border-[#dcdcdc] bg-white p-3 text-xs text-[#4a4a4a]">
                        Messaging a coach may require guardian approval.
                      </div>
                    ) : null}
                    <div className="relative">
                      <input
                        value={newName}
                        onChange={handleRecipientChange}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Type a coach or athlete"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      />
                      {showSuggestions && (lookupLoading || matchingSuggestions.length > 0) ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-10 rounded-2xl border border-[#dcdcdc] bg-white p-2 text-xs shadow-sm">
                          {lookupLoading && matchingSuggestions.length === 0 ? (
                            <div className="flex items-center justify-center px-3 py-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b80f0a] border-t-transparent" />
                            </div>
                          ) : (
                            matchingSuggestions.map((suggestion) => (
                              <button
                                key={`${suggestion.type}-${suggestion.id}`}
                                type="button"
                                onClick={() => handleSuggestionPick(suggestion)}
                                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[#191919] hover:bg-[#f5f5f5]"
                              >
                                <span className="font-semibold">{suggestion.label}</span>
                                <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[#4a4a4a]">
                                  {suggestion.type === 'user'
                                    ? String(suggestion.role || 'User').replace(/_/g, ' ')
                                    : suggestion.type}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                    {guardianGateActive && newName.trim() && !isSelectionAllowed ? (
                      <p className="text-xs text-[#4a4a4a]">
                        Guardian approval required. Submitting will send a request.
                      </p>
                    ) : null}
                    {recentThreads.length > 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Recent</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {recentThreads.map((thread) => (
                            <button
                              key={thread.id}
                              type="button"
                              onClick={() => {
                                setNewName(thread.name)
                                const matchingCoach = coachOptions.find((coach) => coach.name === thread.name)
                                setSelectedRecipientId(matchingCoach?.id || '')
                                setSelectedRecipientRole(
                                  thread.tag?.toLowerCase().includes('coach')
                                    ? 'coach'
                                    : thread.tag?.toLowerCase().includes('athlete')
                                      ? 'athlete'
                                      : matchingCoach
                                        ? 'coach'
                                        : null
                                )
                              }}
                              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                            >
                              {thread.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Write your first message"
                      rows={3}
                      className="w-full rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    />
                    {composerNotice ? <p className="text-xs text-[#4a4a4a]">{composerNotice}</p> : null}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowComposer(false)}
                        className="rounded-full border border-[#191919] px-5 py-2.5 text-sm font-semibold text-[#191919]"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded-full bg-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                      >
                        Start thread
                      </button>
                    </div>
                  </form>
                )}

                <div
                  className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-3 text-sm"
                  onKeyDown={handleKeyNav}
                  role="listbox"
                  tabIndex={0}
                  aria-label="Threads"
                >
                  {loadingThreads ? (
                    <LoadingState label="Loading threads..." />
                  ) : filteredThreads.length === 0 ? (
                    <EmptyState title="No threads found." description="Start a new message to connect with a coach or athlete." />
                  ) : (() => {
                    const renderThreadItem = (thread: ThreadItem) => {
                      const slug = slugify(thread.name)
                      const isActive = slug === activeSlug
                      const isMuted = mutedThreadIds.includes(thread.id)
                      const isArchived = archivedThreadIds.includes(thread.id)
                      const isBlocked = blockedThreadIds.includes(thread.id)
                      return (
                        <div
                          key={thread.id}
                          role="option"
                          aria-selected={isActive}
                          onClick={() => { onSelectThread(slug, thread.id); if (thread.unread) markThreadRead(thread) }}
                          className={`group relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-[20px] border px-3 py-3 sm:gap-4 sm:rounded-[28px] sm:px-5 sm:py-4 transition ${
                            isActive
                              ? 'border-[#191919] bg-white shadow-[0_10px_24px_rgba(25,25,25,0.08)]'
                              : 'border-[#dedede] bg-[#f7f7f7] hover:border-[#191919] hover:bg-white'
                          }`}
                        >
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#191919] text-sm font-bold text-white sm:h-14 sm:w-14 sm:text-lg">
                            {thread.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5 sm:pt-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold leading-tight text-[#191919] sm:text-[1.15rem]">{thread.name}</p>
                                  {thread.unread && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#b80f0a]" aria-label="unread" />}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <p className="line-clamp-2 text-xs leading-5 text-[#8a8a8a] sm:line-clamp-1 sm:text-[1.05rem]">{thread.preview}</p>
                                  {isMuted ? <span className="hidden rounded-full border border-[#d0d0d0] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a8a8a] sm:inline-flex">Muted</span> : null}
                                </div>
                              </div>
                              <div className="flex flex-shrink-0 items-center text-[11px] text-[#5f5f5f] sm:pt-1 sm:text-[1.05rem]">
                                <p>{thread.time}</p>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1 md:hidden">
                              {thread.unread ? (
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); markThreadRead(thread) }}
                                  className="rounded-full border border-[#191919] px-2 py-0.5 text-[9px] font-semibold leading-5 text-[#191919]"
                                >
                                  Mark read
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); toggleMuteThread(thread) }}
                                className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[9px] font-semibold leading-5 text-[#4a4a4a]"
                              >
                                {isMuted ? 'Unmute' : 'Mute'}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); if (isArchived) { unarchiveThread(thread) } else { archiveThread(thread) } }}
                                className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[9px] font-semibold leading-5 text-[#4a4a4a]"
                              >
                                {isArchived ? 'Unarchive' : 'Archive'}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); if (isBlocked) { unblockThread(thread) } else { blockThread(thread) } }}
                                className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[9px] font-semibold leading-5 text-[#4a4a4a]"
                              >
                                {isBlocked ? 'Unblock' : 'Block'}
                              </button>
                            </div>
                          </div>
                          <div className="pointer-events-none absolute bottom-3 right-3 hidden items-center gap-1 rounded-full bg-white/95 p-1 opacity-0 shadow-sm ring-1 ring-[#ececec] transition md:group-hover:flex md:group-hover:opacity-100">
                            {thread.unread ? (
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); markThreadRead(thread) }}
                                className="pointer-events-auto rounded-full border border-[#191919] px-2 py-0.5 text-[10px] font-semibold text-[#191919]"
                              >
                                Mark read
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); toggleMuteThread(thread) }}
                              className="pointer-events-auto rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]"
                            >
                              {isMuted ? 'Unmute' : 'Mute'}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); if (isArchived) { unarchiveThread(thread) } else { archiveThread(thread) } }}
                              className="pointer-events-auto rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]"
                            >
                              {isArchived ? 'Unarchive' : 'Archive'}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => { event.stopPropagation(); if (isBlocked) { unblockThread(thread) } else { blockThread(thread) } }}
                              className="pointer-events-auto rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]"
                            >
                              {isBlocked ? 'Unblock' : 'Block'}
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <>
                        <div className="flex items-center justify-between px-1 pb-1 pt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#9a9a9a]">Conversations</p>
                          <span className="text-[#9a9a9a]">···</span>
                        </div>
                        {filteredThreads.map(renderThreadItem)}
                      </>
                    )
                  })()}
                </div>
              </div>

              <div className="glass-card flex min-w-0 flex-col overflow-hidden border border-[#191919] bg-white">
                <div className="flex-shrink-0 border-b border-[#f0f0f0] px-4 py-4 sm:px-5">
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
                          {showComposer ? 'New Message' : 'Conversation'}
                        </p>
                        <p className="truncate text-base font-semibold text-[#191919]">
                          {showComposer ? (newName || 'Select a recipient') : (activeName || 'Select a thread')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {showComposer ? (
                        <button
                          type="button"
                          onClick={() => setShowComposer(false)}
                          className="rounded-full border border-[#dcdcdc] px-2.5 py-1 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919]"
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowDetailsPanel((open) => !open)}
                          className="rounded-full border border-[#dcdcdc] px-2.5 py-1 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919]"
                        >
                          Info
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {showComposer ? (
                  <form onSubmit={handleNewMessage} className="flex-1 overflow-y-auto px-4 py-5 space-y-4 sm:px-5 sm:py-6">
                    {guardianGateActive ? (
                      <div className="rounded-xl border border-[#dcdcdc] bg-white p-3 text-xs text-[#4a4a4a]">
                        Messaging a coach may require guardian approval.
                      </div>
                    ) : null}
                    <div className="relative">
                      <input
                        value={newName}
                        onChange={handleRecipientChange}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Type a coach or athlete"
                        className="w-full rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                      />
                      {showSuggestions && (lookupLoading || matchingSuggestions.length > 0) ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-10 rounded-2xl border border-[#dcdcdc] bg-white p-2 text-xs shadow-sm">
                          {lookupLoading && matchingSuggestions.length === 0 ? (
                            <div className="flex items-center justify-center px-3 py-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b80f0a] border-t-transparent" />
                            </div>
                          ) : (
                            matchingSuggestions.map((suggestion) => (
                              <button
                                key={`${suggestion.type}-${suggestion.id}`}
                                type="button"
                                onClick={() => handleSuggestionPick(suggestion)}
                                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[#191919] hover:bg-[#f5f5f5]"
                              >
                                <span className="font-semibold">{suggestion.label}</span>
                                <span className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[#4a4a4a]">
                                  {suggestion.type === 'user'
                                    ? String(suggestion.role || 'User').replace(/_/g, ' ')
                                    : suggestion.type}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                    {guardianGateActive && newName.trim() && !isSelectionAllowed ? (
                      <p className="text-xs text-[#4a4a4a]">
                        Guardian approval required. Submitting will send a request.
                      </p>
                    ) : null}
                    {recentThreads.length > 0 ? (
                      <div className="rounded-2xl border border-[#dcdcdc] bg-white p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#4a4a4a]">Recent</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {recentThreads.map((thread) => (
                            <button
                              key={thread.id}
                              type="button"
                              onClick={() => {
                                setNewName(thread.name)
                                const matchingCoach = coachOptions.find((coach) => coach.name === thread.name)
                                setSelectedRecipientId(matchingCoach?.id || '')
                                setSelectedRecipientRole(
                                  thread.tag?.toLowerCase().includes('coach')
                                    ? 'coach'
                                    : thread.tag?.toLowerCase().includes('athlete')
                                      ? 'athlete'
                                      : matchingCoach
                                        ? 'coach'
                                        : null
                                )
                              }}
                              className="rounded-full border border-[#191919] px-3 py-1 font-semibold text-[#191919] hover:text-[#b80f0a] transition-colors"
                            >
                              {thread.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Write your first message"
                      rows={5}
                      className="w-full resize-none rounded-2xl border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-3 text-sm text-[#191919] outline-none focus:border-[#191919]"
                    />
                    {composerNotice ? <p className="text-xs text-[#4a4a4a]">{composerNotice}</p> : null}
                    <button
                      type="submit"
                      className="w-full rounded-full bg-[#b80f0a] px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
                    >
                      Send message
                    </button>
                  </form>
                ) : (
                  <>
                    <div ref={messagePaneRef} onScroll={handleMessagePaneScroll} className="flex-1 overflow-y-auto space-y-4 px-4 py-4 sm:px-5">
                      {loadingOlderMessages ? (
                        <div className="flex justify-center">
                          <p className="rounded-full border border-[#dcdcdc] bg-white px-3 py-1 text-[11px] font-semibold text-[#4a4a4a]">
                            Loading older messages...
                          </p>
                        </div>
                      ) : null}
                      {activeMessages.length === 0 ? (
                        <EmptyState
                          title="No messages yet."
                          description="Start the conversation to see updates here."
                        />
                      ) : (
                        activeMessages.map((message, index) => (
                          <div
                            key={message.id || `${message.time}-${index}`}
                            id={message.id}
                            className={`group flex items-end gap-2.5 ${message.isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                          >
                            <div className={`h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${message.isOwn ? 'bg-[#191919] text-white' : 'bg-[#ececec] text-[#191919]'}`}>
                              {message.sender.charAt(0).toUpperCase()}
                            </div>
                            <div className={`flex max-w-[88%] flex-col gap-1 sm:max-w-[72%] ${message.isOwn ? 'items-end' : 'items-start'}`}>
                              {!message.isOwn && (
                                <p className="px-1 text-[11px] font-semibold text-[#4a4a4a]">{message.sender}</p>
                              )}
                              {message.deleted ? (
                                <div className="rounded-2xl border border-[#ececec] px-3 py-2 text-sm italic text-[#9a9a9a]">
                                  Message deleted
                                </div>
                              ) : editingMessageId === message.id ? (
                                <div className="min-w-[220px] space-y-1.5">
                                  <textarea
                                    value={editBodyDraft}
                                    onChange={(e) => setEditBodyDraft(e.target.value)}
                                    rows={3}
                                    className="w-full resize-none rounded-xl border border-[#191919] bg-white px-3 py-2 text-sm text-[#191919] outline-none"
                                  />
                                  <div className="flex gap-2 text-xs">
                                    <button onClick={() => message.id && handleEditSave(message.id)} className="rounded-full bg-[#191919] px-3 py-1.5 font-semibold text-white">Save</button>
                                    <button onClick={() => { setEditingMessageId(null); setEditBodyDraft('') }} className="rounded-full border border-[#dcdcdc] px-3 py-1.5 font-semibold text-[#4a4a4a]">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${message.isOwn ? 'bg-[#191919] text-white' : 'bg-[#f5f5f5] text-[#191919]'}`}>
                                  {message.content.split(/(@[A-Za-z]+(?: [A-Za-z]+)?)/).map((part, i) =>
                                    part.startsWith('@')
                                      ? <span key={i} className={`font-semibold ${message.isOwn ? 'text-[#f87171]' : 'text-[#b80f0a]'}`}>{part}</span>
                                      : <span key={i}>{part}</span>
                                  )}
                                </div>
                              )}
                              {!message.deleted && message.attachments && message.attachments.length > 0 && (
                                <div className="flex flex-col gap-1 text-xs">
                                  {message.attachments.map((attachment) => (
                                    <a key={attachment.url} href={attachment.url} target="_blank" rel="noreferrer" className="text-[#b80f0a] underline">{attachment.name}</a>
                                  ))}
                                </div>
                              )}
                              <div className={`flex items-center gap-1.5 px-1 ${message.isOwn ? 'flex-row-reverse' : ''}`}>
                                <p className="text-[11px] text-[#9a9a9a]">
                                  {message.time}
                                  {message.isOwn && message.status ? ` · ${message.status}` : ''}
                                  {message.edited && !message.deleted ? ' · edited' : ''}
                                </p>
                                {message.isOwn && !message.deleted && message.id && editingMessageId !== message.id && (
                                  <div className="hidden gap-1 group-hover:flex">
                                    <button type="button" title="Edit" onClick={() => { setEditingMessageId(message.id ?? null); setEditBodyDraft(message.content) }} className="rounded px-1 text-[11px] text-[#9a9a9a] hover:text-[#191919]">✏</button>
                                    <button type="button" title="Delete" onClick={() => message.id && handleDeleteMessage(message.id)} className="rounded px-1 text-[11px] text-[#9a9a9a] hover:text-[#b80f0a]">🗑</button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      {isTyping && typingName ? (
                        <div className="flex justify-start">
                          <div className="rounded-2xl bg-[#f5f5f5] px-3.5 py-2 text-xs text-[#9a9a9a] italic">{typingName} is typing…</div>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex-shrink-0 border-t border-[#f0f0f0] px-4 pb-4 pt-3 space-y-2 sm:px-5 sm:pb-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={attachFile}
                          className="rounded-full border border-[#dcdcdc] px-3 py-1.5 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919] transition"
                        >
                          {attachmentUploading ? 'Uploading...' : '+ Attach'}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          className="hidden"
                          onChange={handleAttachmentSelect}
                        />
                        {pendingAttachment && (
                          <span className="flex items-center gap-2 rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-3 py-1 text-xs text-[#4a4a4a]">
                            {pendingAttachment.name}
                            <button type="button" onClick={() => setPendingAttachment(null)} className="text-[#b80f0a]">✕</button>
                          </span>
                        )}
                      </div>
                      <div
                        className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 transition sm:flex-row sm:items-end ${
                          isDragActive ? 'border-[#b80f0a] bg-[#fff6f5]' : 'border-[#dcdcdc] bg-white'
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDropAttachment}
                      >
                        <textarea
                          value={draftMessage}
                          onChange={(e) => setDraftMessage(e.target.value)}
                          placeholder={`Message ${activeName || 'coach'}…`}
                          rows={3}
                          className="flex-1 resize-none bg-transparent text-sm text-[#191919] outline-none placeholder:text-[#9a9a9a]"
                        />
                        <button
                          onClick={handleSendMessage}
                          className="w-full flex-shrink-0 rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#9f0d08] sm:w-auto"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {showDetailsPanel && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[300] bg-[#191919]/40"
                    onClick={() => setShowDetailsPanel(false)}
                    aria-label="Close info"
                  />
                  <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 pointer-events-none">
                    <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-[#191919] bg-white shadow-xl flex flex-col max-h-[80vh]">
                      <div className="flex items-start justify-between border-b border-[#f0f0f0] px-4 py-4">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.25em] text-[#9a9a9a]">
                            Contact info
                          </p>
                          <p className="mt-1 text-base font-semibold text-[#191919]">{activeName || 'No thread selected'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDetailsPanel(false)}
                          className="rounded-full border border-[#dcdcdc] px-2.5 py-1 text-xs font-semibold text-[#4a4a4a] hover:border-[#191919]"
                        >
                          Close
                        </button>
                      </div>
                      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
                        <section>
                          <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-[#191919]">
                              Participants
                            </h2>
                            <span className="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-xs font-semibold text-[#4a4a4a]">
                              {detailParticipants.length}
                            </span>
                          </div>
                          <div className="mt-3 space-y-2">
                            {detailParticipants.length === 0 ? (
                              <p className="rounded-xl border border-[#ececec] bg-[#fafafa] px-3 py-2 text-xs text-[#6b5f55]">No participant metadata yet.</p>
                            ) : (
                              detailParticipants.map((participant) => (
                                <div key={participant.id} className="flex items-center gap-3 rounded-xl border border-[#ececec] bg-white px-3 py-2">
                                  <div className="h-8 w-8 flex-shrink-0 rounded-full bg-[#ececec] flex items-center justify-center text-xs font-bold text-[#191919]">
                                    {participant.name.charAt(0).toUpperCase()}
                                  </div>
                                  <p className="truncate text-sm font-semibold text-[#191919]">{participant.name}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </section>
                        <section>
                          <h2 className="text-sm font-semibold text-[#191919]">Attachments</h2>
                          <div className="mt-3 space-y-2">
                            {detailAttachments.length === 0 ? (
                              <p className="rounded-xl border border-[#ececec] bg-[#fafafa] px-3 py-2 text-xs text-[#6b5f55]">No attachments in this thread yet.</p>
                            ) : (
                              detailAttachments.map((attachment) => (
                                <a
                                  key={attachment.id}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-between rounded-xl border border-[#ececec] bg-white px-3 py-2 text-sm text-[#191919] hover:border-[#191919]"
                                >
                                  <span className="truncate pr-3 font-semibold">{attachment.name}</span>
                                  <span className="text-xs text-[#b80f0a]">Open</span>
                                </a>
                              ))
                            )}
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
      {toastMessage ? <Toast message={toastMessage} onClose={() => setToastMessage('')} /> : null}
    </main>
  )
}

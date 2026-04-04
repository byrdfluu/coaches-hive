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
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { createSafeClientComponentClient as createClientComponentClient } from '@/lib/supabaseHelpers'
import type { FormEvent, ChangeEvent, DragEvent } from 'react'

type ThreadItem = {
  id: string
  name: string
  preview: string
  time: string
  unread: boolean
  status: string
  tag?: string
  lastSender?: string
  responseTime?: string
  verified?: boolean
}

type MessageItem = {
  id?: string
  sender: string
  content: string
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

type SupabaseThread = {
  id: string
  title: string | null
  is_group: boolean | null
  created_at: string
}

type SupabaseParticipant = {
  thread_id: string
  user_id: string
  display_name: string | null
  role: string | null
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

export default function AthleteMessagesPage() {
  const supabase = createClientComponentClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { needsGuardianApproval, isGuardian } = useAthleteAccess()
  const guardianGateActive = needsGuardianApproval && !isGuardian
  const requestedThread = searchParams?.get('thread') || ''
  const requestedNew = searchParams?.get('new') || ''
  const [filter, setFilter] = useState<'all' | 'unread' | 'coaches' | 'archived' | 'blocked'>('all')
  const [search, setSearch] = useState('')
  const [threadList, setThreadList] = useState<ThreadItem[]>([])
  const [activeMessages, setActiveMessages] = useState<MessageItem[]>([])
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
  const [lookupSuggestions, setLookupSuggestions] = useState<LookupSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [coachOptions, setCoachOptions] = useState<PersonOption[]>([])
  const [approvedCoachIds, setApprovedCoachIds] = useState<string[]>([])
  const [composerNotice, setComposerNotice] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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
    setLookupLoading(true)
    const timeout = setTimeout(() => {
      const matches = coachOptions
        .filter((coach) => coach.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
        .map((coach) => ({
          id: coach.id,
          label: coach.name,
          type: 'user' as const,
          role: 'coach',
        }))
      setLookupSuggestions(matches)
      setLookupLoading(false)
    }, 120)

    return () => {
      clearTimeout(timeout)
      setLookupLoading(false)
    }
  }, [coachOptions, newName])

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
    },
    []
  )

  const handleSuggestionPick = useCallback((suggestion: LookupSuggestion) => {
    setNewName(suggestion.label)
    setShowSuggestions(false)
    setComposerNotice('')
    setLookupSuggestions([])
    setSelectedRecipientId(suggestion.id)
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

  const resolveSelectedCoach = useCallback(() => {
    if (selectedRecipientId) {
      const selectedCoach = coachOptions.find((coach) => coach.id === selectedRecipientId)
      if (selectedCoach) return selectedCoach
    }
    const normalizedName = newName.trim().toLowerCase()
    if (!normalizedName) return null
    return coachOptions.find((coach) => coach.name.trim().toLowerCase() === normalizedName) || null
  }, [coachOptions, newName, selectedRecipientId])

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
        .eq('thread_id', thread.id)
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

  const toggleMuteThread = useCallback(
    async (thread: ThreadItem) => {
      const isMuted = mutedThreadIds.includes(thread.id)
      const action = isMuted ? 'unmute' : 'mute'
      const ok = await updateThreadPreference(thread.id, action)
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
      const ok = await updateThreadPreference(thread.id, 'archive')
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
      const ok = await updateThreadPreference(thread.id, 'unarchive')
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
      const ok = await updateThreadPreference(thread.id, 'block')
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
      const ok = await updateThreadPreference(thread.id, 'unblock')
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
    const { data: membershipRows, error: membershipError } = await supabase
      .from('thread_participants')
      .select('thread_id, muted_at, archived_at, blocked_at')
      .eq('user_id', currentUserId)

    if (membershipError || !membershipRows) {
      setThreadList([])
      setLoadingThreads(false)
      return
    }
    const participantMembershipRows = membershipRows as Array<{
      thread_id: string
      muted_at?: string | null
      archived_at?: string | null
      blocked_at?: string | null
    }>

    setMutedThreadIds(
      participantMembershipRows.filter((row) => row.muted_at).map((row) => row.thread_id)
    )
    setArchivedThreadIds(
      participantMembershipRows.filter((row) => row.archived_at).map((row) => row.thread_id)
    )
    setBlockedThreadIds(
      participantMembershipRows.filter((row) => row.blocked_at).map((row) => row.thread_id)
    )

    const threadIds = participantMembershipRows.map((row) => row.thread_id)
    if (threadIds.length === 0) {
      setThreadList([])
      setLoadingThreads(false)
      return
    }

    const { data: threads } = await supabase
      .from('threads')
      .select('id, title, is_group, created_at')
      .in('id', threadIds)
      .order('created_at', { ascending: false })

    const { data: participants } = await supabase
      .from('thread_participants')
      .select('thread_id, user_id, display_name, role')
      .in('thread_id', threadIds)
    const threadRows = (threads || []) as SupabaseThread[]
    const participantRows = (participants || []) as SupabaseParticipant[]

    const participantUserIds = Array.from(
      new Set(participantRows.map((participant) => participant.user_id))
    )

    const profileMap = new Map<string, SupabaseProfile>()
    coachOptions.forEach(({ id, name }) => {
      profileMap.set(id, { id, full_name: name, role: 'coach' })
    })

    const { data: messageRows } = await supabase
      .from('messages')
      .select('id, thread_id, content, created_at, sender_id')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: false })
    const messagesForThreads = (messageRows || []) as SupabaseMessage[]

    const messageIds = messagesForThreads.map((message) => message.id)
    const { data: receiptRows } = messageIds.length
      ? await supabase
          .from('message_receipts')
          .select('message_id, read_at')
          .eq('user_id', currentUserId)
          .in('message_id', messageIds)
      : { data: [] }

    const receipts = (receiptRows || []) as Array<{ message_id: string; read_at?: string | null }>
    const readSet = new Set(
      receipts
        .filter((receipt) => receipt.read_at)
        .map((receipt) => receipt.message_id)
    )

    const lastMessageByThread = new Map<string, SupabaseMessage>()
    messagesForThreads.forEach((message) => {
      if (!lastMessageByThread.has(message.thread_id)) {
        lastMessageByThread.set(message.thread_id, message)
      }
    })

    const items: ThreadItem[] = []
    threadRows.forEach((thread) => {
      const threadParticipants = participantRows.filter(
        (participant) => participant.thread_id === thread.id
      )
      const otherParticipants = threadParticipants.filter(
        (participant) => participant.user_id !== currentUserId
      )
      const otherRoles = otherParticipants.map(
        (participant) => String(participant.role || profileMap.get(participant.user_id)?.role || '').toLowerCase()
      )
      const isCoachThread = otherRoles.some((role) => role.includes('coach'))
      if (!isCoachThread) return
      const otherNames = threadParticipants
        .filter((participant) => participant.user_id !== currentUserId)
        .map((participant) =>
          participant.display_name || profileMap.get(participant.user_id)?.full_name || 'Coach'
        )
        .filter(Boolean)

      const name =
        (thread.is_group && thread.title) ||
        (!thread.is_group && otherNames.join(', ')) ||
        thread.title ||
        otherNames[0] ||
        'New thread'

      const lastMessage = lastMessageByThread.get(thread.id)
      const lastSender =
        lastMessage?.sender_id === currentUserId
          ? 'You'
          : (lastMessage?.sender_id && profileMap.get(lastMessage.sender_id)?.full_name) || 'Coach'
      const preview = lastMessage?.content || 'Start the conversation'
      const time = formatRelativeTime(lastMessage?.created_at || thread.created_at)
      const tag = 'Coach'
      const verified = isCoachThread
      const responseTime = 'Responds in ~2h'
      const unread = messagesForThreads.some(
        (message) =>
          message.thread_id === thread.id &&
          message.sender_id !== currentUserId &&
          !readSet.has(message.id)
      )

      items.push({
        id: thread.id,
        name,
        preview,
        time,
        unread,
        status: 'Active',
        tag,
        lastSender,
        responseTime,
        verified,
      })
    })

    setThreadList(items)
    setLoadingThreads(false)
  }, [currentUserId, supabase, coachOptions])

  const loadMessages = useCallback(
    async (threadId: string) => {
      if (!currentUserId) return
      const { data: messages } = await supabase
        .from('messages')
        .select('id, thread_id, content, created_at, sender_id, edited_at, deleted_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
      const threadMessages = (messages || []) as SupabaseMessage[]

      const senderMap = new Map<string, SupabaseProfile>()
      coachOptions.forEach(({ id, name }) => {
        senderMap.set(id, { id, full_name: name, role: 'coach' })
      })

      const messageIds = threadMessages.map((message) => message.id)
      const { data: attachmentRows } = messageIds.length
        ? await supabase
            .from('message_attachments')
            .select('message_id, file_url, file_name, file_type, file_size')
            .in('message_id', messageIds)
        : { data: [] }

      const attachmentMap = new Map<string, AttachmentItem[]>()
      const attachments = (attachmentRows || []) as Array<{
        message_id: string
        file_url: string
        file_name?: string | null
        file_type?: string | null
        file_size?: number | null
      }>
      attachments.forEach((row) => {
        const list = attachmentMap.get(row.message_id) || []
        list.push({
          url: row.file_url,
          name: row.file_name || 'Attachment',
          type: row.file_type || undefined,
          size: row.file_size || undefined,
        })
        attachmentMap.set(row.message_id, list)
      })

      const { data: receiptRows } = messageIds.length
        ? await supabase
            .from('message_receipts')
            .select('message_id, delivered_at, read_at, user_id')
            .in('message_id', messageIds)
        : { data: [] }

      const receiptMap = new Map<string, { delivered: boolean; read: boolean }>()
      const deliveryReceipts = (receiptRows || []) as Array<{
        message_id: string
        delivered_at?: string | null
        read_at?: string | null
        user_id?: string | null
      }>
      deliveryReceipts.forEach((receipt) => {
        if (receipt.user_id === currentUserId) return
        const existing = receiptMap.get(receipt.message_id) || { delivered: false, read: false }
        if (receipt.delivered_at) existing.delivered = true
        if (receipt.read_at) existing.read = true
        receiptMap.set(receipt.message_id, existing)
      })

      const feed = threadMessages.map((message) => {
        const isOwn = message.sender_id === currentUserId
        const senderName = isOwn ? 'You' : senderMap.get(message.sender_id)?.full_name || 'Coach'
        const receiptStatus = receiptMap.get(message.id)
        const status = isOwn
          ? receiptStatus?.read
            ? 'Read'
            : receiptStatus?.delivered
              ? 'Delivered'
              : 'Sent'
          : undefined
        return {
          id: message.id,
          sender: senderName,
          content: message.content || '',
          time: formatMessageTime(message.created_at),
          status,
          isOwn,
          attachments: attachmentMap.get(message.id) || [],
          deleted: !!message.deleted_at,
          edited: !!message.edited_at,
        }
      })

      setActiveMessages(feed)
      await markMessagesDelivered(threadMessages)
      await markMessagesRead(threadMessages)
    },
    [currentUserId, markMessagesDelivered, markMessagesRead, supabase, coachOptions]
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
    if (requestedThread && slugs.includes(requestedThread)) return requestedThread
    return slugs[0] || ''
  }, [requestedThread, slugs])

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
  const activeName = activeThread?.name || ''
  const activeThreadId = activeThread?.id || ''
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
    const threadIds = threadList.map((thread) => thread.id)
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
          if (newMessage?.thread_id === activeThreadId) {
            loadMessages(activeThreadId)
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
    currentUserId,
    loadMessages,
    loadThreads,
    markMessagesDelivered,
    supabase,
    threadList,
  ])

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
      }
    }
  }, [coachOptions, requestedNew])

  useEffect(() => {
    if (!activeThreadId) {
      setActiveMessages([])
      return
    }
    loadMessages(activeThreadId)
  }, [activeThreadId, loadMessages])


  const onSelectThread = useCallback(
    (slug: string) => {
      router.push(`?thread=${slug}`)
    },
    [router]
  )

  useEffect(() => {
    if (filteredThreads.length === 0) return
    const hasActive = filteredThreads.some((t) => slugify(t.name) === activeSlug)
    if (!hasActive) {
      onSelectThread(slugify(filteredThreads[0].name))
    }
  }, [activeSlug, filteredThreads, onSelectThread])

  const handleKeyNav = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = filteredThreads.findIndex((t) => slugify(t.name) === activeSlug)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = filteredThreads[(currentIndex + 1) % filteredThreads.length]
        next && onSelectThread(slugify(next.name))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prevIndex = (currentIndex - 1 + filteredThreads.length) % filteredThreads.length
        const prev = filteredThreads[prevIndex]
        prev && onSelectThread(slugify(prev.name))
      }
    },
    [activeSlug, filteredThreads, onSelectThread]
  )

  const handleNewMessage = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      const content = newMessage.trim()
      if (!content || !currentUserId) return

      const selectedCoach = resolveSelectedCoach()
      if (!selectedCoach) {
        setComposerNotice('Pick a linked coach from the suggestions to continue.')
        return
      }

      if (guardianGateActive && !isSelectionAllowed) {
        await requestGuardianApproval({
          target_type: 'coach',
          target_id: selectedCoach.id,
          target_label: selectedCoach.name,
        })
        return
      }

      if (guardianGateActive && !allowedRecipientIds.has(selectedCoach.id)) {
        await requestGuardianApproval({
          target_type: 'coach',
          target_id: selectedCoach.id,
          target_label: selectedCoach.name,
        })
        return
      }

      const response = await fetch('/api/messages/thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedCoach.name,
          is_group: false,
          participant_ids: [selectedCoach.id],
          first_message: content,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        setComposerNotice(payload?.error || 'Unable to start thread.')
        return
      }

      const payload = await response.json().catch(() => ({}))
      const nextTitle = payload.title || selectedCoach.name

      setNewName('')
      setSelectedRecipientId('')
      setNewMessage('')
      setComposerNotice('')
      setShowComposer(false)
      await loadThreads()
      onSelectThread(slugify(nextTitle))
    },
    [
      allowedRecipientIds,
      currentUserId,
      guardianGateActive,
      isSelectionAllowed,
      loadThreads,
      newMessage,
      onSelectThread,
      requestGuardianApproval,
      resolveSelectedCoach,
    ]
  )

  const attachFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleSendMessage = useCallback(async () => {
    const content = draftMessage.trim()
    if ((!content && !pendingAttachment) || !activeThreadId || !currentUserId) return

    await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thread_id: activeThreadId,
        body: content,
        attachment: pendingAttachment,
      }),
    })

    setDraftMessage('')
    setPendingAttachment(null)
    await loadMessages(activeThreadId)
    await loadThreads()
  }, [activeThreadId, currentUserId, draftMessage, loadMessages, loadThreads, pendingAttachment])

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
          <div className="flex flex-wrap gap-2 text-sm">
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
            <section className="relative grid min-w-0 gap-5 min-h-[520px] lg:h-[calc(100vh-260px)] lg:grid-cols-[1fr_1.4fr]">
              {showThreadDrawer && (
                <button
                  type="button"
                  className="fixed inset-0 z-[300] bg-[#191919]/35 lg:hidden"
                  onClick={() => setShowThreadDrawer(false)}
                  aria-label="Close panel"
                />
              )}
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
                <div className="flex-shrink-0 flex flex-col gap-3 pb-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or topic"
                      className="w-full min-w-0 flex-1 rounded-2xl border border-[#dcdcdc] bg-white px-3 py-2 text-sm text-[#191919] outline-none focus:border-[#191919] md:min-w-[200px]"
                    />
                    <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto">
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
                                const match = threadList.find((t) => t.id === r.thread_id)
                                if (match) {
                                  router.push(`?thread=${slugify(match.name)}`)
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
                        placeholder="Type a linked coach"
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
                  className="flex-1 overflow-y-auto mt-2 space-y-3 text-sm"
                  onKeyDown={handleKeyNav}
                  role="listbox"
                  tabIndex={0}
                  aria-label="Threads"
                >
                  {loadingThreads ? (
                    <LoadingState label="Loading threads..." />
                  ) : filteredThreads.length === 0 ? (
                    <EmptyState title="No threads found." description="Start a new message to connect with a linked coach." />
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
                          onClick={() => { onSelectThread(slug); if (thread.unread) markThreadRead(thread) }}
                          className={`group flex cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border px-3 py-3 transition ${
                            isActive ? 'border-[#191919] bg-[#f5f5f5]' : 'border-[#ececec] bg-white hover:border-[#191919]'
                          }`}
                        >
                          <div className={`h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${isActive ? 'bg-[#191919] text-white' : 'bg-[#ececec] text-[#191919]'}`}>
                            {thread.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-semibold text-[#191919]">{thread.name}</p>
                              {thread.verified && <span className="rounded-full border border-[#b80f0a] bg-[#fff6f5] px-1.5 py-0.5 text-[10px] font-semibold text-[#b80f0a]">✓</span>}
                              {thread.unread && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#b80f0a]" aria-label="unread" />}
                              {isMuted && <span className="rounded-full border border-[#dcdcdc] px-1.5 py-0.5 text-[10px] text-[#9a9a9a]">Muted</span>}
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-xs text-[#9a9a9a]">
                              {thread.lastSender ? `${thread.lastSender}: ` : ''}{thread.preview}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2 text-xs text-[#4a4a4a]">
                            <p>{thread.time}</p>
                            <div className="hidden items-center gap-1 opacity-0 transition group-hover:opacity-100 md:flex">
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); markThreadRead(thread) }}
                                className="rounded-full border border-[#191919] px-2 py-0.5 text-[10px] font-semibold text-[#191919]"
                              >
                                Mark read
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); toggleMuteThread(thread) }}
                                className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]"
                              >
                                {isMuted ? 'Unmute' : 'Mute'}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); if (isArchived) { unarchiveThread(thread) } else { archiveThread(thread) } }}
                                className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]"
                              >
                                {isArchived ? 'Unarchive' : 'Archive'}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => { event.stopPropagation(); if (isBlocked) { unblockThread(thread) } else { blockThread(thread) } }}
                                className="rounded-full border border-[#dcdcdc] px-2 py-0.5 text-[10px] font-semibold text-[#4a4a4a]"
                              >
                                {isBlocked ? 'Unblock' : 'Block'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <>
                        <div className="flex items-center justify-between px-1 pb-1 pt-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#9a9a9a]">Coach threads</p>
                          <span className="text-[#9a9a9a]">···</span>
                        </div>
                        {filteredThreads.map(renderThreadItem)}
                      </>
                    )
                  })()}
                </div>
              </div>

              <div className="glass-card flex min-w-0 flex-col overflow-hidden border border-[#191919] bg-white">
                <div className="flex-shrink-0 flex items-center justify-between border-b border-[#f0f0f0] px-5 py-4">
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
                {showComposer ? (
                  <form onSubmit={handleNewMessage} className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
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
                        placeholder="Type a linked coach"
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
                      className="rounded-full bg-[#b80f0a] px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                    >
                      Send message
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="flex-1 overflow-y-auto space-y-4 px-5 py-4">
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
                            <div className={`flex max-w-[72%] flex-col gap-1 ${message.isOwn ? 'items-end' : 'items-start'}`}>
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
                    <div className="flex-shrink-0 border-t border-[#f0f0f0] px-5 pb-5 pt-3 space-y-2">
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
                        className={`flex items-end gap-3 rounded-2xl border px-4 py-3 transition ${
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
                          className="flex-shrink-0 rounded-full bg-[#b80f0a] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9f0d08] transition-colors"
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

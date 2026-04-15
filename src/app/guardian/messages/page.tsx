'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import RoleInfoBanner from '@/components/RoleInfoBanner'
import GuardianSidebar from '@/components/GuardianSidebar'

type Conversation = {
  thread_id: string
  athlete_id: string
  athlete_name: string
  other_participant_names: string
  last_message: string
  last_message_at: string
  time: string
  is_group: boolean
}

type Athlete = {
  id: string
  name: string
}

type Message = {
  id: string
  thread_id: string
  sender_id: string
  sender_name: string
  sender_role: string | null
  content: string
  created_at: string
  edited_at: string | null
  deleted: boolean
  is_guardian: boolean
}

const formatMessageTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function GuardianMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [filterAthlete, setFilterAthlete] = useState('')
  const [activeThread, setActiveThread] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [inboxError, setInboxError] = useState('')
  const [loadError, setLoadError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoadingInbox(true)
      const res = await fetch('/api/guardian/messages', { cache: 'no-store' }).catch(() => null)
      if (res?.ok) {
        const data = await res.json().catch(() => null)
        setConversations(data?.conversations || [])
        setAthletes(data?.athletes || [])
      } else {
        setInboxError('Unable to load conversations. Please refresh.')
      }
      setLoadingInbox(false)
    }
    load()
  }, [])

  const openThread = async (conv: Conversation) => {
    setActiveThread(conv)
    setMessages([])
    setLoadError('')
    setLoadingMessages(true)
    const res = await fetch(
      `/api/guardian/messages/conversation?thread_id=${encodeURIComponent(conv.thread_id)}`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (res?.ok) {
      const data = await res.json().catch(() => null)
      setMessages(data?.messages || [])
    } else {
      setLoadError('Unable to load messages. Please try again.')
    }
    setLoadingMessages(false)
  }

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const filtered = filterAthlete
    ? conversations.filter((c) => c.athlete_id === filterAthlete)
    : conversations

  const groupedByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = []
    let lastDate = ''
    for (const msg of msgs) {
      const d = formatDate(msg.created_at)
      if (d !== lastDate) {
        groups.push({ date: d, messages: [msg] })
        lastDate = d
      } else {
        groups[groups.length - 1].messages.push(msg)
      }
    }
    return groups
  }

  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-10">
        <RoleInfoBanner role="guardian" />
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Guardian</p>
          <h1 className="display text-3xl font-semibold text-[#191919]">Messages</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            View all conversations between your athletes and their coaches.
          </p>
        </div>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[200px_1fr]">
          <GuardianSidebar />

          <div className="glass-card border border-[#191919] bg-white overflow-hidden" style={{ minHeight: 560 }}>
            {loadingInbox ? (
              <div className="p-6 text-sm text-[#4a4a4a]">Loading…</div>
            ) : (
              <div className="flex h-full" style={{ minHeight: 560 }}>
                {/* Left panel — conversation list */}
                <div className="flex w-72 flex-none flex-col border-r border-[#dcdcdc]">
                  {/* Athlete filter */}
                  {athletes.length > 1 && (
                    <div className="border-b border-[#dcdcdc] px-4 py-3">
                      <select
                        value={filterAthlete}
                        onChange={(e) => setFilterAthlete(e.target.value)}
                        className="w-full rounded-full border border-[#dcdcdc] bg-white px-3 py-1.5 text-xs text-[#191919] focus:border-[#191919] focus:outline-none"
                      >
                        <option value="">All athletes</option>
                        {athletes.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {inboxError && (
                    <p className="px-4 py-3 text-xs text-red-600">{inboxError}</p>
                  )}
                  <div className="flex-1 overflow-y-auto">
                    {filtered.length === 0 ? (
                      <p className="p-4 text-sm text-[#4a4a4a]">
                        {conversations.length === 0
                          ? 'No conversations yet. Athletes will appear here once they start messaging coaches.'
                          : 'No conversations for this athlete.'}
                      </p>
                    ) : (
                      filtered.map((conv) => {
                        const isActive = activeThread?.thread_id === conv.thread_id
                        return (
                          <button
                            key={conv.thread_id}
                            type="button"
                            onClick={() => openThread(conv)}
                            className={`w-full border-b border-[#f0f0f0] px-4 py-3 text-left transition-colors ${
                              isActive ? 'bg-[#f5f5f5]' : 'hover:bg-[#fafafa]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-[#191919] truncate">
                                {conv.other_participant_names}
                              </p>
                              <span className="flex-none text-[10px] text-[#9a9a9a]">{conv.time}</span>
                            </div>
                            <span className="mt-0.5 inline-block rounded-full bg-[#191919] px-2 py-0.5 text-[10px] font-semibold text-white">
                              {conv.athlete_name}
                            </span>
                            {conv.last_message && (
                              <p className="mt-1 truncate text-xs text-[#4a4a4a]">{conv.last_message}</p>
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Right panel — conversation */}
                <div className="flex flex-1 flex-col">
                  {!activeThread ? (
                    <div className="flex flex-1 items-center justify-center p-8 text-sm text-[#4a4a4a]">
                      Select a conversation to view messages.
                    </div>
                  ) : (
                    <>
                      {/* Header */}
                      <div className="border-b border-[#dcdcdc] px-5 py-3">
                        <p className="text-sm font-semibold text-[#191919]">
                          {activeThread.other_participant_names}
                        </p>
                        <p className="text-xs text-[#4a4a4a]">
                          Athlete: <span className="font-semibold">{activeThread.athlete_name}</span>
                        </p>
                      </div>

                      {/* Messages */}
                      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ maxHeight: 380 }}>
                        {loadingMessages ? (
                          <p className="text-sm text-[#4a4a4a]">Loading messages…</p>
                        ) : loadError ? (
                          <p className="text-xs text-red-600">{loadError}</p>
                        ) : messages.length === 0 ? (
                          <p className="text-sm text-[#4a4a4a]">No messages in this conversation.</p>
                        ) : (
                          groupedByDate(messages).map(({ date, messages: dayMsgs }) => (
                            <div key={date}>
                              <div className="mb-3 flex items-center gap-2">
                                <div className="h-px flex-1 bg-[#e8e8e8]" />
                                <span className="text-[10px] text-[#9a9a9a]">{date}</span>
                                <div className="h-px flex-1 bg-[#e8e8e8]" />
                              </div>
                              <div className="space-y-3">
                                {dayMsgs.map((msg) => (
                                  <div
                                    key={msg.id}
                                    className={`flex flex-col ${msg.is_guardian ? 'items-end' : 'items-start'}`}
                                  >
                                    <div className="flex items-baseline gap-2 mb-0.5">
                                      <span className="text-xs font-semibold text-[#191919]">
                                        {msg.is_guardian ? 'You (Guardian)' : msg.sender_name}
                                      </span>
                                      {msg.sender_role && !msg.is_guardian && (
                                        <span className="text-[10px] text-[#9a9a9a] capitalize">{msg.sender_role}</span>
                                      )}
                                      <span className="text-[10px] text-[#9a9a9a]">
                                        {formatMessageTime(msg.created_at)}
                                      </span>
                                    </div>
                                    <div
                                      className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                                        msg.is_guardian
                                          ? 'bg-[#191919] text-white'
                                          : msg.deleted
                                          ? 'bg-[#f5f5f5] text-[#9a9a9a] italic'
                                          : 'bg-[#f5f5f5] text-[#191919]'
                                      }`}
                                    >
                                      {msg.content}
                                      {msg.edited_at && !msg.deleted && (
                                        <span className="ml-1 text-[10px] opacity-60">(edited)</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                        <div ref={messagesEndRef} />
                      </div>

                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
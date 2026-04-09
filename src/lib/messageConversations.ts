export const normalizeConversationParticipantIds = (participantIds: string[]) =>
  Array.from(new Set(participantIds.filter(Boolean))).sort()

export const isDirectConversationParticipantSet = (participantIds: string[], isGroup?: boolean | null) =>
  !isGroup && normalizeConversationParticipantIds(participantIds).length === 2

export const MAIN_ATHLETE_CONTEXT_KEY = 'main'
const DIRECT_THREAD_CONTEXT_PREFIX = '[[ch-athlete-context:'

export const normalizeAthleteContextKey = (value?: string | null) => {
  const trimmed = String(value || '').trim()
  return trimmed || MAIN_ATHLETE_CONTEXT_KEY
}

export const buildDirectConversationId = (participantIds: string[], directContextKey?: string | null) => {
  const normalized = normalizeConversationParticipantIds(participantIds)
  const baseId = `dm:${normalized.join(':')}`
  const normalizedContextKey = normalizeAthleteContextKey(directContextKey)
  if (!normalizedContextKey || normalizedContextKey === MAIN_ATHLETE_CONTEXT_KEY) {
    return baseId
  }
  return `${baseId}:ctx:${encodeURIComponent(normalizedContextKey)}`
}

export const encodeDirectThreadTitle = (params: {
  title: string
  athleteContextKey?: string | null
  athleteContextLabel?: string | null
}) => {
  const title = String(params.title || '').trim()
  const normalizedContextKey = normalizeAthleteContextKey(params.athleteContextKey)
  const normalizedContextLabel = String(params.athleteContextLabel || '').trim()
  if (!title) return title
  return `${DIRECT_THREAD_CONTEXT_PREFIX}${encodeURIComponent(normalizedContextKey)}|${encodeURIComponent(normalizedContextLabel)}]]${title}`
}

export const parseDirectThreadTitle = (value?: string | null) => {
  const title = String(value || '')
  if (!title.startsWith(DIRECT_THREAD_CONTEXT_PREFIX)) {
    return {
      visibleTitle: title,
      athleteContextKey: null as string | null,
      athleteContextLabel: null as string | null,
    }
  }

  const match = title.match(/^\[\[ch-athlete-context:([^|\]]+)(?:\|([^\]]*))?\]\](.*)$/s)
  if (!match) {
    return {
      visibleTitle: title,
      athleteContextKey: null as string | null,
      athleteContextLabel: null as string | null,
    }
  }

  return {
    visibleTitle: match[3] || '',
    athleteContextKey: decodeURIComponent(match[1] || ''),
    athleteContextLabel: decodeURIComponent(match[2] || ''),
  }
}

export const extractAthleteContextLabelFromMessage = (value?: string | null) => {
  const content = String(value || '')
  const match = content.match(/^\[Athlete context:\s*([^\]]+)\]\s*\n?/i)
  return match?.[1]?.trim() || null
}

export const buildConversationId = (params: {
  participantIds: string[]
  isGroup?: boolean | null
  threadId: string
  directContextKey?: string | null
}) => {
  if (isDirectConversationParticipantSet(params.participantIds, params.isGroup)) {
    return buildDirectConversationId(params.participantIds, params.directContextKey)
  }
  return `thread:${params.threadId}`
}

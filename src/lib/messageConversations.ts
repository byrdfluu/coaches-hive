export const normalizeConversationParticipantIds = (participantIds: string[]) =>
  Array.from(new Set(participantIds.filter(Boolean))).sort()

export const isDirectConversationParticipantSet = (participantIds: string[], isGroup?: boolean | null) =>
  !isGroup && normalizeConversationParticipantIds(participantIds).length === 2

export const buildDirectConversationId = (participantIds: string[]) => {
  const normalized = normalizeConversationParticipantIds(participantIds)
  return `dm:${normalized.join(':')}`
}

export const buildConversationId = (params: {
  participantIds: string[]
  isGroup?: boolean | null
  threadId: string
}) => {
  if (isDirectConversationParticipantSet(params.participantIds, params.isGroup)) {
    return buildDirectConversationId(params.participantIds)
  }
  return `thread:${params.threadId}`
}

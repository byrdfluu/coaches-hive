export type SupportPriority = 'low' | 'medium' | 'high' | 'urgent'

export const getSlaMinutes = (priority: SupportPriority | string | null | undefined) => {
  switch ((priority || 'medium').toString()) {
    case 'urgent':
      return 60
    case 'high':
      return 240
    case 'low':
      return 1440
    default:
      return 480
  }
}

export const getSlaDueAt = (createdAt: string | Date, priority: SupportPriority | string | null | undefined) => {
  const minutes = getSlaMinutes(priority)
  const base = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  return new Date(base.getTime() + minutes * 60000).toISOString()
}

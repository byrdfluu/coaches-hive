export const normalizeCoachProductStatus = (value?: string | null) =>
  String(value || '').trim().toLowerCase()

export const isActiveCoachProductStatus = (value?: string | null) =>
  normalizeCoachProductStatus(value) !== 'draft'


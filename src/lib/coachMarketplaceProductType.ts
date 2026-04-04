export const DEFAULT_DRAFT_PRODUCT_TYPE = 'digital'
export const DEFAULT_DRAFT_PRODUCT_CATEGORY = 'Digital product'

export const normalizeCoachProductCategoryInput = (value: unknown) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)[0] || ''

export const normalizeCoachProductType = (format: unknown) => {
  const normalizedFormat = String(format || '').trim().toLowerCase()
  if (normalizedFormat === 'physical') return 'physical'
  if (normalizedFormat === 'session') return 'session'
  return 'digital'
}

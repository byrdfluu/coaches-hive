export const MULTI_ATHLETE_CHECKOUT_STORAGE_KEY = 'ch_multi_athlete_checkout_v1'

export type AthleteCheckoutStatus =
  | 'pending'
  | 'preparing'
  | 'checkout_ready'
  | 'payment_processing'
  | 'enrolled'
  | 'failed'
  | 'cancelled'

export type AthleteCheckoutRow = {
  athleteId: string
  athleteName: string
  status: AthleteCheckoutStatus
  idempotencyKey: string
  registrationId?: string
  checkoutRecordId?: string
  checkoutUrl?: string
  message?: string
}

export type MultiAthleteCheckoutWorkflow = {
  offeringId: string
  offeringName: string
  organizationId: string
  offeringType: string
  billingType: string
  occurrenceIds: string[]
  rows: AthleteCheckoutRow[]
  updatedAt: string
}

const canonicalOccurrenceIds = (occurrenceIds: string[]) => Array.from(new Set(occurrenceIds)).sort()

export async function stableAthleteCheckoutKey(input: {
  parentId: string
  athleteId: string
  offeringId: string
  occurrenceIds: string[]
}) {
  const source = [input.parentId, input.athleteId, input.offeringId, ...canonicalOccurrenceIds(input.occurrenceIds)].join(':')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  const digest = Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, '0')).join('')
  return `family-offering:${digest}`
}

export function checkoutSummary(rows: AthleteCheckoutRow[]) {
  return rows.reduce((summary, row) => {
    summary[row.status] += 1
    return summary
  }, { pending: 0, preparing: 0, checkout_ready: 0, payment_processing: 0, enrolled: 0, failed: 0, cancelled: 0 })
}

export function updateCheckoutRow(
  workflow: MultiAthleteCheckoutWorkflow,
  athleteId: string,
  update: Partial<AthleteCheckoutRow>,
): MultiAthleteCheckoutWorkflow {
  return {
    ...workflow,
    rows: workflow.rows.map(row => row.athleteId === athleteId ? { ...row, ...update } : row),
    updatedAt: new Date().toISOString(),
  }
}

export function markReturnedCheckout(
  workflows: MultiAthleteCheckoutWorkflow[],
  recordId: string,
  cancelled: boolean,
) {
  let offeringId = ''
  const next = workflows.map(workflow => {
    let matched = false
    const rows = workflow.rows.map(row => {
      if (![row.registrationId, row.checkoutRecordId].includes(recordId)) return row
      offeringId = workflow.offeringId
      matched = true
      return {
        ...row,
        status: cancelled ? 'cancelled' as const : 'payment_processing' as const,
        message: cancelled ? 'Checkout was cancelled. No payment was recorded.' : 'Payment is being confirmed by Stripe.',
      }
    })
    return { ...workflow, rows, updatedAt: matched ? new Date().toISOString() : workflow.updatedAt }
  })
  return { workflows: next, offeringId }
}

export function readCheckoutWorkflows(): MultiAthleteCheckoutWorkflow[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(MULTI_ATHLETE_CHECKOUT_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeCheckoutWorkflows(workflows: MultiAthleteCheckoutWorkflow[]) {
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(MULTI_ATHLETE_CHECKOUT_STORAGE_KEY, JSON.stringify(workflows))
  }
}

export function saveCheckoutWorkflow(workflow: MultiAthleteCheckoutWorkflow) {
  const workflows = readCheckoutWorkflows().filter(item => item.offeringId !== workflow.offeringId)
  writeCheckoutWorkflows([...workflows, workflow])
}

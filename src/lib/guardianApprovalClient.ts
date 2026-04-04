export type GuardianApprovalRequestPayload = {
  target_type: 'coach' | 'org' | 'team'
  target_id: string
  target_label: string
  scope?: 'messages' | 'transactions'
}

export type GuardianApprovalRequestResult = {
  ok: boolean
  status: 'approved' | 'pending' | 'error'
  id?: string | null
  error?: string
}

export const requestGuardianApproval = async (
  payload: GuardianApprovalRequestPayload,
): Promise<GuardianApprovalRequestResult> => {
  const response = await fetch('/api/guardian-approvals/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    return {
      ok: false,
      status: 'error',
      error: data?.error || 'Unable to request guardian approval.',
    }
  }

  const status = data?.status === 'approved' ? 'approved' : 'pending'
  return {
    ok: true,
    status,
    id: data?.id || null,
  }
}

export const isGuardianApprovalApiError = (payload: any) => {
  const code = String(payload?.code || '')
  return code === 'guardian_approval_required' || code === 'guardian_approval_pending'
}

export const guardianPendingMessage =
  'Guardian approval requested. Your parent/guardian will be notified.'

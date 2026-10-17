type EnrollmentLabelInput = {
  attendanceModel?: string | null
  registrationStatus?: string | null
  sessionsRemaining?: number | null
  hasPublishedOccurrences?: boolean
  selectedFutureOccurrences?: number
}

const ACTIVE_REGISTRATION_STATUSES = new Set(['paid', 'confirmed', 'registered', 'completed', 'accepted', 'active'])

export const offeringEnrollmentLabel = (input: EnrollmentLabelInput): string => {
  const attendanceModel = String(input.attendanceModel || '')
  const isCreditOffering = attendanceModel === 'monthly_session_membership' || attendanceModel === 'prepaid_session_pack'
  if (isCreditOffering) return `${Math.max(0, Number(input.sessionsRemaining || 0))} sessions available`

  const selected = Math.max(0, Number(input.selectedFutureOccurrences || 0))
  if (selected > 0) return `${selected} upcoming session${selected === 1 ? '' : 's'} selected`
  if (input.hasPublishedOccurrences) return 'No dates selected'
  if (ACTIVE_REGISTRATION_STATUSES.has(String(input.registrationStatus || '').toLowerCase())) return 'Enrolled in program'
  return 'No upcoming sessions'
}

'use client'

type Role = 'coach' | 'athlete' | 'admin' | 'guardian'

// Referral capture is disabled until incentives are implemented.
// When ready, restore the captureReferral useEffect that reads
// user_metadata.ref_code / localStorage ch_ref_code and POSTs to /api/referrals.

export default function RoleInfoBanner({ role: _role }: { role: Role }) {
  return null
}

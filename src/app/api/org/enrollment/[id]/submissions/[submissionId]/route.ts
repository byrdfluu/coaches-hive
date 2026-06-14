import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOrgInviteEmail } from '@/lib/inviteDelivery'

export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = [
  'org_admin','club_admin','travel_admin','school_admin',
  'athletic_director','program_director','team_manager',
]

async function getOrgId(userId: string) {
  const { data } = await supabaseAdmin
    .from('organization_memberships')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { org_id?: string } | null)?.org_id ?? null
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const { session, error } = await getSessionRole(ORG_ADMIN_ROLES)
  if (error) return error
  const orgId = await getOrgId(session.user.id)
  if (!orgId) return jsonError('No organization found', 404)
  const { id, submissionId } = await params

  const body = await request.json().catch(() => ({}))
  const action = body?.action as string | undefined
  if (action !== 'approve' && action !== 'decline') return jsonError('action must be approve or decline')

  // Verify form + submission belong to this org
  const { data: form } = await supabaseAdmin
    .from('org_enrollment_forms')
    .select('id, title, team_id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!form) return jsonError('Form not found', 404)

  const { data: sub } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('form_id', id)
    .maybeSingle()
  if (!sub) return jsonError('Submission not found', 404)
  const submission = sub as {
    id: string; athlete_email: string; athlete_name: string;
    guardian_email?: string | null; status: string
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('org_enrollment_submissions')
    .update({ status: action === 'approve' ? 'approved' : 'declined', reviewed_by: session.user.id, reviewed_at: now })
    .eq('id', submissionId)
    .select()
    .single()

  if (updateError) return jsonError('Failed to update submission', 500)

  if (action === 'approve') {
    // Look up org name for the invite email
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .maybeSingle()
    const orgName = (orgRow as { name?: string } | null)?.name ?? null

    // Look up reviewer profile name
    const { data: reviewerProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', session.user.id)
      .maybeSingle()
    const inviterName = (reviewerProfile as { full_name?: string } | null)?.full_name ?? null

    // Look up team name if applicable
    const formTyped = form as { id: string; title: string; team_id: string | null }
    let teamName: string | null = null
    if (formTyped.team_id) {
      const { data: teamRow } = await supabaseAdmin
        .from('org_teams')
        .select('name')
        .eq('id', formTyped.team_id)
        .maybeSingle()
      teamName = (teamRow as { name?: string } | null)?.name ?? null
    }

    // Check if this email has an existing account
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers()
    const existingProfile = (existingUser?.users || []).find(
      (u) => u.email?.toLowerCase() === submission.athlete_email.toLowerCase()
    )
    const isNewUser = !existingProfile

    // Create org_invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('org_invites')
      .insert({
        org_id: orgId,
        team_id: formTyped.team_id || null,
        role: 'athlete',
        invited_email: submission.athlete_email.toLowerCase(),
        invited_user_id: existingProfile?.id || null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (!inviteError && invite) {
      await sendOrgInviteEmail({
        toEmail: submission.athlete_email,
        inviteId: (invite as { id: string }).id,
        orgId,
        orgName,
        teamId: formTyped.team_id,
        teamName,
        role: 'athlete',
        inviterName,
        isNewUser,
      })
    }
  }

  return NextResponse.json({ submission: updated })
}

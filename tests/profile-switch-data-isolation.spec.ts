import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.locator('form input[type="email"]').fill(email)
  await page.locator('form input[type="password"]').fill(password)
  await page.getByRole('button', { name: /log in/i }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

test('every profile switch persists and resolves the exact selected context', async ({ page }) => {
  const email = process.env.E2E_COACH_EMAIL
  const password = process.env.E2E_COACH_PASSWORD
  if (!email || !password) return
  await login(page, email, password)
  const original = await (await page.request.get('/api/roles/available')).json()
  const switches: Array<Record<string, string>> = []
  for (const workspace of original.workspaces || []) {
    const roles: string[] = workspace.roles || []
    if (workspace.workspace_type === 'organization' && roles.some((role: string) => ['org_admin', 'owner'].includes(role))) {
      switches.push({ workspace_id: workspace.workspace_id, organization_id: workspace.organization_id, acting_role: roles.includes('org_admin') ? 'org_admin' : 'owner', kind: 'org' })
    }
    if (roles.some((role: string) => ['coach', 'assistant_coach'].includes(role))) {
      const teams = (original.coach_team_contexts || []).filter((team: any) => team.workspace_id === workspace.workspace_id)
      if (teams.length) for (const team of teams) switches.push({ workspace_id: workspace.workspace_id, organization_id: workspace.organization_id || '', acting_role: roles.includes('coach') ? 'coach' : 'assistant_coach', coach_team_id: team.team_id, kind: 'coach' })
      else switches.push({ workspace_id: workspace.workspace_id, organization_id: workspace.organization_id || '', acting_role: roles.includes('coach') ? 'coach' : 'assistant_coach', kind: 'coach' })
    } else if (workspace.workspace_type === 'independent_coach' && roles.includes('owner')) {
      switches.push({ workspace_id: workspace.workspace_id, acting_role: 'owner', kind: 'coach' })
    }
  }
  for (const athlete of original.athlete_profiles || []) switches.push({ athlete_profile_id: athlete.id, kind: 'athlete' })

  expect(switches.length).toBeGreaterThan(1)
  for (const selection of switches) {
    const response = await page.request.post('/api/workspaces/active', { data: selection })
    expect(response.ok(), JSON.stringify(selection)).toBeTruthy()
    const available = await (await page.request.get('/api/roles/available')).json()
    if (selection.workspace_id) {
      expect(available.active_workspace_id).toBe(selection.workspace_id)
      expect(available.selected_athlete_profile_id).toBeNull()
    }
    if (selection.coach_team_id) expect(available.selected_coach_team_id).toBe(selection.coach_team_id)
    if (selection.kind === 'coach') {
      const context = await (await page.request.get('/api/coach/context')).json()
      expect(context.workspaceId).toBe(selection.workspace_id)
      expect(context.teamId || null).toBe(selection.coach_team_id || null)
      expect(context.organizationId || null).toBe(selection.organization_id || null)
      const [sessions, notes, payments] = await Promise.all([
        page.request.get('/api/sessions').then((result) => result.json()),
        page.request.get('/api/coach/notes').then((result) => result.json()),
        page.request.get('/api/coach/payment-summary').then((result) => result.json()),
      ])
      expect(notes.context.workspaceId).toBe(selection.workspace_id)
      expect(notes.context.teamId || null).toBe(selection.coach_team_id || null)
      expect(payments.context.workspaceId).toBe(selection.workspace_id)
      for (const session of sessions.sessions || []) {
        if (selection.organization_id) expect(session.org_id).toBe(selection.organization_id)
        else expect(session.org_id).toBeNull()
        if (selection.coach_team_id) expect(session.team_id).toBe(selection.coach_team_id)
      }
    } else if (selection.kind === 'org') {
      const overview = await (await page.request.get('/api/org/overview')).json()
      expect(overview.workspace_id).toBe(selection.workspace_id)
      expect(overview.organization?.id).toBe(selection.organization_id)
    } else {
      expect(available.active_workspace_id).toBeNull()
      expect(available.active_role).toBe('athlete')
      expect(available.selected_athlete_profile_id).toBe(selection.athlete_profile_id)
      expect(available.selected_coach_team_id).toBeNull()
      const profile = await (await page.request.get(`/api/athlete/profile?athlete_profile_id=${selection.athlete_profile_id}`)).json()
      expect(profile.profile?.id || profile.athlete_profile?.id || profile.id).toBe(selection.athlete_profile_id)
    }
  }

  if (original.active_workspace_id) {
    await page.request.post('/api/workspaces/active', { data: { workspace_id: original.active_workspace_id, acting_role: original.active_role, coach_team_id: original.selected_coach_team_id } })
  } else if (original.selected_athlete_profile_id) {
    await page.request.post('/api/workspaces/active', { data: { athlete_profile_id: original.selected_athlete_profile_id } })
  }
})

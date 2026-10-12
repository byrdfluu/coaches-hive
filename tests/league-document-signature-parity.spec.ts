import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const iosSource = (path: string) => readFileSync(resolve('/Users/juwan/Desktop/CH App', path), 'utf8')

test('web league participation exposes the same immutable signature workflow as iOS', () => {
  const route = source('src/app/api/league/participation/route.ts')
  const card = source('src/components/LeagueParticipationCard.tsx')
  const ios = iosSource('CH App/LeaguePortal/LeagueMemberRequirementsView.swift')

  for (const contract of ['league_document_signatures', 'sign_league_document', 'signature_hash', 'league-documents']) {
    expect(route).toContain(contract)
    expect(ios).toContain(contract === 'league-documents' ? 'LeagueDocumentStorageService' : contract)
  }
  expect(route).toContain("p_client_platform: 'web'")
  expect(route).toContain(".in('target_type', scope.targetTypes)")
  expect(card).toContain('Review & sign')
  expect(card).toContain('authority_attested')
  expect(card).toContain('consent_attested')
  expect(card).toContain('Audit hash:')
})

test('league signature migration protects files, signer roles, and immutable records', () => {
  const migration = source('supabase/migrations/20261012020000_league_document_signature_parity.sql')

  expect(migration).toContain("'league-documents', 'league-documents', false, 20971520")
  expect(migration).toContain('alter table public.league_document_signatures enable row level security')
  expect(migration).toContain('revoke insert, update, delete on public.league_document_signatures from authenticated')
  expect(migration).toContain("p_signer_capacity = 'athlete_or_guardian'")
  expect(migration).toContain("p_signer_capacity = 'coach'")
  expect(migration).toContain("p_signer_capacity = 'organization_representative'")
  expect(migration).toContain("p_signer_capacity = 'league_representative'")
  expect(migration).toContain('ap.auth_user_id=p_user_id')
  expect(migration).toContain('family_subscription_athletes')
  expect(migration).toContain('guardian_privacy_consents')
  expect(migration).toContain('org_team_coaches')
  expect(migration).toContain("raise exception 'You are not authorized to sign this league document'")
  expect(migration).toContain('document_storage_path_snapshot')
  expect(migration).not.toContain('signed_url')
})

test('league participation endpoints reject unauthenticated reads and signatures', async ({ request }) => {
  const getResponse = await request.get('/api/league/participation')
  expect(getResponse.status()).toBe(401)

  const postResponse = await request.post('/api/league/participation', {
    data: {
      document_id: '11111111-1111-1111-1111-111111111111',
      signer_name: 'Test Signer',
      authority_attested: true,
      consent_attested: true,
    },
  })
  expect(postResponse.status()).toBe(401)
})

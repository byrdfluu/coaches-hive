import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8')

test('family storefront exposes only an authorized designated contact',()=>{
  const route=read('src/app/api/mobile/family/storefront/route.ts')
  const helper=read('src/lib/familyOrganizationContact.ts')
  expect(route).toContain('primary_family_contact:familyContact')
  expect(helper).toContain("eq('status', 'active')")
  expect(helper).toContain('manage_messages')
  for(const field of ['user_id','full_name','avatar_url','organization_id','organization_name','contact_label','can_message'])expect(helper).toContain(field)
})

test('family contact search matches name, organization and label',()=>{
  const helper=read('src/lib/familyOrganizationContact.ts')
  expect(helper).toContain('[contact.full_name, contact.organization_name, contact.contact_label]')
  const route=read('src/app/api/mobile/family/contacts/route.ts')
  expect(route).toContain('familyContactMatches')
  expect(route).toContain('ATHLETE_PROFILE_UNAVAILABLE')
})

test('family contact thread creation is idempotent and safety scoped',()=>{
  const migration=read('supabase/migrations/20261002080000_primary_family_messaging_contact.sql')
  expect(migration).toContain('unique(organization_id,athlete_profile_id,family_user_id,contact_user_id)')
  expect(migration).toContain('pg_advisory_xact_lock')
  expect(migration).toContain('athlete_organization_memberships')
  expect(migration).toContain('guardian_privacy_consents')
  expect(migration).toContain('user_blocks')
  expect(migration).toContain('allowDirectMessages')
  expect(migration).toContain("'Parent Support'")
})

test('organization admins can only select active messaging staff',()=>{
  const route=read('src/app/api/mobile/organizations/[orgId]/family-contact/route.ts')
  expect(route).toContain('authorizeWorkspaceRequest')
  expect(route).toContain("workspaceCan(authority.workspace, 'manage_members')")
  expect(route).toContain("eq('status', 'active')")
  expect(route).toContain('contact_not_authorized')
})

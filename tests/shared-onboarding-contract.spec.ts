import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ONBOARDING_STEPS, PRE_PAYWALL_STEP_IDS } from '../src/lib/sharedOnboardingContract'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('shared web and iOS onboarding', () => {
  test('matches the native role stages and question identifiers', () => {
    expect(PRE_PAYWALL_STEP_IDS.solo_coach).toEqual(['sport','experience','ageGroups','modality'])
    expect(PRE_PAYWALL_STEP_IDS.org_director).toEqual(['orgName','sports','ageGroups','location','alsoCoach'])
    expect(ONBOARDING_STEPS.athlete.map((step) => step.id)).toEqual(['name','sport','grade','contactName','contactRel','contactPhone','referralSource'])
    expect(ONBOARDING_STEPS.org_coach.map((step) => step.id)).toContain('philosophy')
  })

  test('writes the same canonical Supabase records read by iOS', () => {
    const route = source('src/app/api/onboarding/profile/route.ts')
    for (const table of ['profiles','independent_coach_profiles','org_settings','athlete_profiles','emergency_contacts']) {
      expect(route).toContain(`'${table}'`)
    }
    expect(route).toContain('onboarding_answers')
    expect(route).toContain('onboarding_completed_at')
  })

  test('routes verified signups through onboarding before plan selection', () => {
    const verify = source('src/app/auth/verify/page.tsx')
    expect(verify).toContain("'/coach/onboarding?stage=pre'")
    expect(verify).toContain("'/org/onboarding?stage=pre'")
    expect(verify).toContain("'/athlete/onboarding'")
  })
})

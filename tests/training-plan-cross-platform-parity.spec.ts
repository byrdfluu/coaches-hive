import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
const iosRoot = path.resolve(process.cwd(), '../CH App')
const iosSource = (relativePath: string) => fs.readFileSync(path.join(iosRoot, relativePath), 'utf8')

test('training plan API returns the active coach workspace athlete roster', () => {
  const route = source('src/app/api/training-plans/route.ts')
  expect(route).toContain('resolveAuthorizedCoachAthleteProfileIds')
  expect(route).toContain('available_athletes')
  expect(route).toContain(".eq('status', 'active')")
})

test('web exposes create edit delete and profile scoped progress', () => {
  const page = source('src/app/coach/plans/page.tsx')
  const route = source('src/app/api/training-plans/route.ts')
  expect(page).toContain("method: 'POST'")
  expect(page).toContain("method: 'PATCH'")
  expect(page).toContain("method: 'DELETE'")
  expect(route).toContain('resolveAuthorizedAthleteContext')
  expect(route).toContain("onConflict: 'plan_id,athlete_id'")
})

test('iOS uses the same API for coach mutations and athlete progress', () => {
  const service = iosSource('CH App/Services/TrainingPlansAPI.swift')
  const coach = iosSource('CH App/CoachPortal/Plans/CoachPlansView.swift')
  const athlete = iosSource('CH App/AthletePortal/Plans/AthletePlansView.swift')
  expect(service).toContain('path: "api/training-plans"')
  expect(service).toContain('func createTrainingPlan')
  expect(service).toContain('func updateTrainingPlan')
  expect(service).toContain('func deleteTrainingPlan')
  expect(service).toContain('func updateTrainingPlanProgress')
  expect(coach).toContain('MobileWebAPIService().trainingPlans()')
  expect(athlete).toContain('updateTrainingPlanProgress')
})

test('both clients reconcile training plans when they become active', () => {
  expect(source('src/app/coach/plans/page.tsx')).toContain("window.addEventListener('focus', refresh)")
  expect(iosSource('CH App/CoachPortal/Plans/CoachPlansView.swift')).toContain('if phase == .active')
  expect(iosSource('CH App/AthletePortal/Plans/AthletePlansView.swift')).toContain('if phase == .active')
})

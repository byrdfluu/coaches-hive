import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const iosSource = (path: string) => readFileSync(resolve('/Users/juwan/Desktop/CH App', path), 'utf8')

test('web and iOS use one authoritative coach review contract', () => {
  const athleteRoute = source('src/app/api/reviews/route.ts')
  const coachRoute = source('src/app/api/coach/reviews/route.ts')
  const coachResponseRoute = source('src/app/api/coach/reviews/response/route.ts')
  const adminRoute = source('src/app/api/admin/reviews/route.ts')
  const athleteView = iosSource('CH App/AthletePortal/Reviews/AthleteReviewView.swift')
  const coachView = iosSource('CH App/CoachPortal/Reviews/CoachReviewsView.swift')
  const adminView = iosSource('CH App/AdminPortal/Reviews/AdminReviewsView.swift')
  const mobileService = iosSource('CH App/Services/MobileWebAPIService.swift')

  expect(athleteRoute).toContain("body: parsed.reviewBody")
  expect(athleteRoute).toContain("status: 'pending'")
  expect(coachRoute).toContain(".eq('coach_id', user.id)")
  expect(coachResponseRoute).toContain('getMobileRequestUser(request)')
  expect(adminRoute).toContain('requireAdminApi(request)')

  for (const view of [athleteView, coachView, adminView]) {
    expect(view).not.toContain('.from("coach_reviews")')
    expect(view).not.toContain('is_public')
    expect(view).not.toContain('case content')
  }

  expect(mobileService).toContain('path: "api/reviews"')
  expect(mobileService).toContain('path: "api/coach/reviews"')
  expect(mobileService).toContain('path: "api/coach/reviews/response"')
  expect(mobileService).toContain('path: "api/admin/reviews"')
})

test('review APIs reject unauthenticated browser and mobile requests', async ({ request }) => {
  const athleteGet = await request.get('/api/reviews?coach_id=00000000-0000-0000-0000-000000000000')
  expect(athleteGet.status()).toBe(401)
  for (const method of ['post', 'patch', 'delete'] as const) {
    const response = await request[method]('/api/reviews', {
      data: { review_id: '00000000-0000-0000-0000-000000000000', rating: 5, body: 'Test' },
    })
    expect(response.status()).toBe(401)
  }

  expect((await request.get('/api/coach/reviews')).status()).toBe(401)
  expect((await request.post('/api/coach/reviews/response', {
    data: { review_id: '00000000-0000-0000-0000-000000000000', coach_response: 'Test' },
  })).status()).toBe(401)
  expect((await request.get('/api/admin/reviews')).status()).toBe(401)
  expect((await request.patch('/api/admin/reviews', {
    data: { review_id: '00000000-0000-0000-0000-000000000000', status: 'approved' },
  })).status()).toBe(401)
})

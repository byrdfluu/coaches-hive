import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const iosRoot = '/Users/juwan/Desktop/CH App'
const iosSource = (path: string) => readFileSync(resolve(iosRoot, path), 'utf8')

test('program creation and editing persist an owned marketplace product link', () => {
  const collectionRoute = source('src/app/api/coach/programs/route.ts')
  const itemRoute = source('src/app/api/coach/programs/[id]/route.ts')
  const productsRoute = source('src/app/api/coach/products/route.ts')

  for (const route of [collectionRoute, itemRoute]) {
    expect(route).toContain(".from('products')")
    expect(route).toContain(".eq('coach_id', session.user.id)")
    expect(route).toContain("Marketplace product not found.")
  }
  expect(collectionRoute).toContain('product_id: productId')
  expect(itemRoute).toContain('updates.product_id = productId')
  expect(productsRoute).toContain('export async function GET()')
  expect(productsRoute).toContain(".select('id, title, status')")
  expect(productsRoute).toContain(".eq('coach_id', session.user.id)")
  expect(productsRoute).toContain('NextResponse.json({ products: data ?? [] })')
})

test('iOS coach authoring uses every shared program and exercise mutation', () => {
  const api = iosSource('CH App/Services/CoachProgramAuthoringAPI.swift')
  const hub = iosSource('CH App/CoachPortal/Operations/CoachOperationsHubView.swift')

  expect(api).toContain('path: "api/coach/programs"')
  expect(api).toContain(String.raw`"api/coach/programs/\($0.uuidString)"`)
  expect(api).toContain(String.raw`"api/coach/programs/\(programId.uuidString)/exercises"`)
  expect(api).toContain(String.raw`"api/coach/programs/\(programId.uuidString)/exercises/\(settings.exerciseId.uuidString)"`)
  expect(api).toContain('path: "api/coach/exercises"')
  expect(api).toContain('path: "api/coach/products"')
  expect(api).toContain(String.raw`"api/coach/exercises/\($0.uuidString)"`)
  for (const method of ['"GET"', '"POST"', '"PATCH"', '"DELETE"']) {
    expect(api).toContain(`method: ${method}`)
  }
  expect(hub).toContain('CoachProgramsView()')
  expect(hub).toContain('operatesIndependentCoachBusiness')
})

test('iOS program contract preserves cross-platform field names', () => {
  const api = iosSource('CH App/Services/CoachProgramAuthoringAPI.swift')
  for (const field of [
    'duration_label', 'product_id', 'exercise_count', 'exercise_id', 'cpe_id',
    'muscle_group', 'movement_pattern', 'video_url', 'tracking_fields',
    'photo_paths', 'thumbnail_path', 'rest_seconds',
  ]) {
    expect(api).toContain(`"${field}"`)
  }
})

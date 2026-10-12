import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const iosSource = (path: string) => readFileSync(resolve('/Users/juwan/Desktop/CH App', path), 'utf8')

test('web and iOS admin commerce use the same authenticated API contracts', () => {
  const ordersRoute = source('src/app/api/admin/orders/route.ts')
  const disputesRoute = source('src/app/api/admin/disputes/route.ts')
  const mobileService = iosSource('CH App/Services/MobileWebAPIService.swift')
  const nativeOrders = iosSource('CH App/AdminPortal/Orders/AdminOrdersViewModel.swift')
  const nativeDisputes = iosSource('CH App/AdminPortal/Disputes/AdminDisputesViewModel.swift')

  expect(ordersRoute).toContain('requireAdminApi(request)')
  expect(disputesRoute).toContain('requireAdminApi(request)')
  expect(mobileService).toContain('path: "api/admin/orders"')
  expect(mobileService).toContain('path: "api/admin/disputes"')

  for (const legacyTable of ['org_payments', 'program_registrations', 'marketplace_orders']) {
    expect(nativeOrders).not.toContain(`from("${legacyTable}")`)
  }
  expect(nativeDisputes).not.toContain('from("org_payments")')
  expect(nativeOrders).toContain('adminOrders(page: pageNumber)')
  expect(nativeDisputes).toContain('adminDisputes(page: pageNumber)')
  expect(nativeOrders).toContain('updateAdminOrder')
  expect(nativeDisputes).toContain('updateAdminDispute')
})

test('admin commerce APIs reject unauthenticated mobile and browser requests', async ({ request }) => {
  for (const path of ['/api/admin/orders', '/api/admin/disputes']) {
    const getResponse = await request.get(path)
    expect(getResponse.status()).toBe(401)

    const patchResponse = await request.patch(path, {
      data: { order_id: '00000000-0000-0000-0000-000000000000', action: 'dispute' },
    })
    expect(patchResponse.status()).toBe(401)
  }
})

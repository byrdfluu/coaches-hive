import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261004040000_authoritative_superadmin_revenue_contracts.sql')

test('Superadmin revenue separates owned revenue from customer GMV', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  for (const field of [
    'subscription_revenue', 'platform_service_fee_revenue', 'refunded_revenue',
    'stripe_fees_absorbed', 'dispute_losses', 'net_revenue', 'pending_revenue', 'available_revenue',
  ]) expect(sql).toContain(field)
  expect(sql).toContain('a.platform_fee_cents,0)+coalesce(a.service_fee_cents,0)')
  expect(sql).not.toMatch(/total_revenue[\s\S]{0,120}sum\(a\.gross_amount_cents\)/)
})

test('Superadmin ledger retains legacy fields and adds optional allocation fields', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  for (const field of [
    'description text', 'amount numeric', 'owner_name text', 'checkout_type text',
    'payer_name text', 'athlete_name text', 'team_name text', 'payment_status text',
    'customer_total numeric', 'service_fee numeric', 'platform_fee numeric', 'stripe_fee numeric',
    'organization_net numeric', 'refunded_amount numeric', 'payout_status text',
  ]) expect(sql).toContain(field)
  expect(sql).toContain("a.livemode=true")
  expect(sql).toContain('coalesce(w.is_test,false)=false')
})

test('Insights retains cents-based GMV contract', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260809030000_test_data_classification.sql'), 'utf8')
  for (const field of ['gross_volume_cents', 'platform_fee_cents', 'seller_net_cents', 'refunded_amount_cents', 'mrr_cents']) {
    expect(sql).toContain(`'${field}'`)
  }
})

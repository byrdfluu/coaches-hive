import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test.describe('Slack delivery cron', () => {
  test('claims, delivers, and completes queued Slack events', () => {
    const worker = source('src/app/api/cron/slack-delivery/route.ts')
    expect(worker).toContain("rpc('claim_slack_events'")
    expect(worker).toContain("rpc('complete_slack_event'")
    expect(worker).toContain("rpc('fail_slack_event'")
    expect(worker).toContain('SLACK_DISPATCH_SECRET')
    expect(worker).toContain('SLACK_PAYMENTS_WEBHOOK_URL')
    expect(worker).toContain("['hooks.slack.com', 'hooks.slack-gov.com']")
  })

  test('exposes only the secret-protected route and schedules it', () => {
    const policy = source('src/lib/middlewarePolicy.ts')
    const vercel = JSON.parse(source('vercel.json'))
    expect(policy).toContain("'/api/cron/slack-delivery'")
    expect(vercel.crons).toContainEqual({ path: '/api/cron/slack-delivery', schedule: '*/5 * * * *' })
  })
})

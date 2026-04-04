import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const API_ROOT = join(process.cwd(), 'src', 'app', 'api')

const PUBLIC_API_PREFIXES = [
  '/api/org/public',
  '/api/org/fees',
  '/api/support/public',
  '/api/stripe/webhook',
  '/api/webhooks/gmail',
  '/api/webhooks/postmark',
  '/api/reminders/sessions',
  '/api/integrations/google/callback',
  '/api/integrations/zoom/callback',
]

const SECRET_GUARDED_ROUTES = [
  { path: '/api/webhooks/gmail', pattern: /SUPPORT_WEBHOOK_SECRET|x-support-secret|secret/i },
  { path: '/api/webhooks/postmark', pattern: /POSTMARK_WEBHOOK_SECRET|x-postmark-secret/i },
  { path: '/api/stripe/webhook', pattern: /STRIPE_WEBHOOK_SECRET|stripe-signature/i },
  { path: '/api/reminders/sessions', pattern: /REMINDER_CRON_SECRET|x-reminder-secret/i },
]

const collectRouteFiles = (root) => {
  const found = []
  const walk = (dir) => {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const full = join(dir, entry)
      const stats = statSync(full)
      if (stats.isDirectory()) {
        walk(full)
        continue
      }
      if (entry === 'route.ts') {
        found.push(full)
      }
    }
  }
  walk(root)
  return found
}

const toApiPath = (file) => {
  const rel = relative(API_ROOT, file).replace(/\\/g, '/')
  return `/api/${rel.replace(/\/route\.ts$/, '')}`
}

const isPublicApi = (apiPath) =>
  PUBLIC_API_PREFIXES.some((prefix) => apiPath === prefix || apiPath.startsWith(`${prefix}/`))

const routeFiles = collectRouteFiles(API_ROOT)
const issues = []

for (const file of routeFiles) {
  const apiPath = toApiPath(file)
  const src = readFileSync(file, 'utf8')

  // Hard fail if handlers parse JSON without a safe fallback.
  if (src.match(/await\s+request\.json\(\)(?!\.catch)/)) {
    issues.push(`${apiPath}: request.json() used without catch fallback`)
  }

  // Flag potential sensitive error leakage.
  if (
    src.match(/NextResponse\.json\(\s*\{\s*error:\s*message\s*\},\s*\{\s*status/m)
    || src.match(/NextResponse\.json\(\s*\{\s*error:\s*[^}]*\.message/m)
  ) {
    issues.push(`${apiPath}: direct error.message returned in response`)
  }

  // Public endpoints must still be protected by signed webhook/secret validation.
  if (isPublicApi(apiPath)) {
    const guard = SECRET_GUARDED_ROUTES.find((route) => apiPath === route.path)
    if (guard && !guard.pattern.test(src)) {
      issues.push(`${apiPath}: missing expected secret/signature guard`)
    }
  }
}

console.log(`Audited ${routeFiles.length} API routes`)
if (issues.length === 0) {
  console.log('No API hardening issues found.')
  process.exit(0)
}

console.log(`Found ${issues.length} issue(s):`)
for (const issue of issues) {
  console.log(`- ${issue}`)
}
process.exit(1)

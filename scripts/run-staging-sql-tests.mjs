import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const databaseUrl = String(process.env.STAGING_DATABASE_URL || '').trim()
if (!databaseUrl) {
  console.error('STAGING_DATABASE_URL is required. Production is never used as a fallback.')
  process.exit(2)
}
let parsed
try { parsed = new URL(databaseUrl) } catch { console.error('STAGING_DATABASE_URL must be a valid PostgreSQL URL.'); process.exit(2) }
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  console.error('STAGING_DATABASE_URL must use postgres:// or postgresql://.')
  process.exit(2)
}
const productionRef = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').hostname.split('.')[0] } catch { return '' }
})()
if (productionRef && (parsed.hostname.includes(productionRef) || parsed.username.includes(productionRef))) {
  console.error('Refusing to run SQL tests: STAGING_DATABASE_URL appears to reference the configured production project.')
  process.exit(3)
}
const testDirectory = path.resolve('supabase/tests')
const tests = fs.readdirSync(testDirectory).filter(file => file.endsWith('.sql')).sort()
if (!tests.length) { console.error('No SQL tests found.'); process.exit(2) }
for (const test of tests) {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', databaseUrl, '-f', path.join(testDirectory, test)], { stdio: 'inherit' })
  if (result.error?.code === 'ENOENT') { console.error('psql is required to run staging SQL tests.'); process.exit(2) }
  if (result.status !== 0) { console.error(`SQL test failed: ${test}`); process.exit(result.status || 1) }
  console.log(`SQL test passed: ${test}`)
}

import fs from 'node:fs'
import path from 'node:path'

const directory = path.resolve('supabase/migrations')
const files = fs.readdirSync(directory).filter(file => /^\d{14}_.+\.sql$/.test(file)).sort()
const byVersion = new Map()
for (const file of files) {
  const version = file.slice(0, 14)
  byVersion.set(version, [...(byVersion.get(version) || []), file])
}
const duplicates = [...byVersion.entries()].filter(([, names]) => names.length > 1)
if (duplicates.length) {
  console.error('Duplicate Supabase migration versions detected:')
  for (const [version, names] of duplicates) console.error(`- ${version}: ${names.join(', ')}`)
  console.error('Create forward-only replacement migrations or a staging baseline; do not rewrite applied production history.')
  process.exit(1)
}
console.log(`Migration manifest valid: ${files.length} unique versions in timestamp order.`)

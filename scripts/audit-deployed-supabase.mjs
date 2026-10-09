import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

nextEnv.loadEnvConfig(process.cwd(), true)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Supabase URL and service key are required')

const response = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
})
if (!response.ok) throw new Error(`OpenAPI schema request failed: ${response.status}`)
const openapi = await response.json()
const definitions = openapi.definitions || openapi.components?.schemas || {}
const tables = Object.entries(definitions).map(([name, definition]) => ({
  name,
  required: definition.required || [],
  columns: Object.fromEntries(Object.entries(definition.properties || {}).map(([column, value]) => [column, {
    type: value.type || null,
    format: value.format || null,
    default: value.default,
    enum: value.enum || null,
  }])),
})).sort((left, right) => left.name.localeCompare(right.name))

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: buckets, error: bucketError } = await supabase.storage.listBuckets()
if (bucketError) throw bucketError
const report = {
  generatedAt: new Date().toISOString(),
  projectRef: new URL(url).hostname.split('.')[0],
  tableCount: tables.length,
  tables,
  buckets: (buckets || []).map((bucket) => ({
    id: bucket.id,
    name: bucket.name,
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit,
    allowedMimeTypes: bucket.allowed_mime_types,
  })).sort((left, right) => left.name.localeCompare(right.name)),
}

const destination = process.argv[2]
if (destination) fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`)
else console.log(JSON.stringify(report, null, 2))

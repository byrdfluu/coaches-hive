import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

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
const columns = (table) => new Set(Object.keys(definitions[table]?.properties || {}))
const failures = []

const requireTable = (table) => {
  if (!definitions[table]) failures.push(`missing table: ${table}`)
}
const requireColumns = (table, required) => {
  if (!definitions[table]) return
  const deployed = columns(table)
  for (const column of required) {
    if (!deployed.has(column)) failures.push(`missing column: ${table}.${column}`)
  }
}

requireTable('message_reactions')
requireTable('paperwork_audit_events')
requireTable('edge_action_rate_limits')
requireTable('verification_documents')
requireColumns('org_notification_preferences', ['weekly_digest'])
requireColumns('league_notification_preferences', ['weekly_digest'])
requireColumns('message_attachments', ['file_path', 'file_name', 'file_type', 'file_size'])
requireColumns('products', ['media_storage_path', 'media_filename', 'media_mime_type', 'media_size_bytes'])
requireColumns('marketplace_items', ['image_storage_path', 'image_filename', 'image_mime_type', 'image_size_bytes'])
requireColumns('coach_waiver_assignments', ['signed_pdf_storage_path', 'signed_pdf_sha256', 'proof_generated_at'])
requireColumns('coach_waivers', ['storage_bucket', 'storage_path'])
requireColumns('org_document_completions', ['signed_pdf_storage_path', 'signed_pdf_sha256', 'proof_generated_at'])
requireColumns('verification_documents', ['owner_user_id', 'category', 'storage_path', 'original_filename', 'mime_type', 'size_bytes'])

for (const rpc of [
  'assert_edge_action_rate_limit',
  'record_paperwork_event',
  'sign_coach_waiver_with_authority',
  'sign_org_document_with_authority',
]) {
  if (!Object.keys(openapi.paths || {}).some((path) => path.endsWith(`/rpc/${rpc}`))) {
    failures.push(`missing RPC: ${rpc}`)
  }
}

const paperworkFunction = await fetch(`${url}/functions/v1/paperwork-proof`, { method: 'OPTIONS' })
if (!paperworkFunction.ok) failures.push('missing or unhealthy Edge Function: paperwork-proof')

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: bucketRows, error: bucketError } = await supabase.storage.listBuckets()
if (bucketError) throw bucketError
const buckets = new Map((bucketRows || []).map((bucket) => [bucket.id, bucket]))
const requireBucket = ({ id, isPublic, maxBytes, mimeTypes }) => {
  const bucket = buckets.get(id)
  if (!bucket) {
    failures.push(`missing storage bucket: ${id}`)
    return
  }
  if (bucket.public !== isPublic) failures.push(`incorrect visibility: ${id} must be ${isPublic ? 'public' : 'private'}`)
  if (bucket.file_size_limit !== maxBytes) failures.push(`incorrect size limit: ${id} must be ${maxBytes} bytes`)
  const deployedTypes = new Set(bucket.allowed_mime_types || [])
  for (const mime of mimeTypes) {
    if (!deployedTypes.has(mime)) failures.push(`missing MIME type: ${id} must allow ${mime}`)
  }
}

requireBucket({
  id: 'product-media',
  isPublic: false,
  maxBytes: 20 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/x-m4v'],
})
requireBucket({
  id: 'private-athlete-media',
  isPublic: false,
  maxBytes: 200 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'video/mp4', 'video/quicktime', 'video/x-m4v'],
})
for (const contract of [
  { id: 'attachments', isPublic: false, maxBytes: 10 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
  { id: 'avatars', isPublic: true, maxBytes: 5 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  { id: 'branding', isPublic: true, maxBytes: 10 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] },
  { id: 'coach-avatars-v2', isPublic: true, maxBytes: 8 * 1024 * 1024, mimeTypes: ['image/jpeg'] },
  { id: 'coach-waivers', isPublic: false, maxBytes: 20 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'text/plain', 'application/rtf', 'text/rtf', 'application/octet-stream'] },
  { id: 'org-documents', isPublic: false, maxBytes: 20 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'text/plain', 'application/rtf', 'text/rtf', 'application/octet-stream'] },
  { id: 'profile-gallery', isPublic: true, maxBytes: 10 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] },
  { id: 'signed-paperwork', isPublic: false, maxBytes: 20 * 1024 * 1024, mimeTypes: ['application/pdf'] },
  { id: 'verifications', isPublic: false, maxBytes: 20 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
]) requireBucket(contract)

if (failures.length > 0) {
  console.error(`Parity deployment verification failed for ${new URL(url).hostname.split('.')[0]}:`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log(`Parity deployment contracts verified for ${new URL(url).hostname.split('.')[0]}.`)

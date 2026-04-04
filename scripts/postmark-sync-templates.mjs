import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import dns from 'node:dns'

const parseEnvFile = (filePath) => {
  try {
    const raw = readFileSync(filePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const equalIndex = trimmed.indexOf('=')
      if (equalIndex <= 0) continue
      const key = trimmed.slice(0, equalIndex).trim()
      if (process.env[key]) continue
      const value = trimmed.slice(equalIndex + 1).trim().replace(/^['"]|['"]$/g, '')
      process.env[key] = value
    }
  } catch {
    // env file optional
  }
}

parseEnvFile(resolve(process.cwd(), '.env.local'))
parseEnvFile(resolve(process.cwd(), '.env'))

const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN
const POSTMARK_LAYOUT_ALIAS = process.env.POSTMARK_LAYOUT_ALIAS || ''
const API_BASE = 'https://api.postmarkapp.com'
const DRY_RUN = process.argv.includes('--dry-run')
const TEMPLATE_FILE = resolve(process.cwd(), 'scripts/postmark-templates.json')
const DNS_SERVERS = (process.env.POSTMARK_DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

try {
  dns.setDefaultResultOrder('ipv4first')
  if (DNS_SERVERS.length) dns.setServers(DNS_SERVERS)
} catch {
  // ignore DNS tuning errors and continue with system defaults
}

if (!POSTMARK_SERVER_TOKEN) {
  console.error('Missing POSTMARK_SERVER_TOKEN in env.')
  process.exit(1)
}

const loadTemplates = () => {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf8'))
  } catch (error) {
    console.error(`Unable to read templates file: ${TEMPLATE_FILE}`)
    console.error(error instanceof Error ? error.message : 'Invalid JSON.')
    process.exit(1)
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error(`Template file must contain a non-empty array: ${TEMPLATE_FILE}`)
    process.exit(1)
  }

  for (const [index, row] of parsed.entries()) {
    if (!row || typeof row !== 'object') {
      console.error(`Invalid template at index ${index}: must be an object.`)
      process.exit(1)
    }
    const required = ['alias', 'name', 'subject', 'htmlBody', 'textBody']
    for (const key of required) {
      if (typeof row[key] !== 'string' || !row[key].trim()) {
        console.error(`Template ${index} missing required field: ${key}`)
        process.exit(1)
      }
    }
  }

  return parsed
}

const templates = loadTemplates()

const postmarkRequest = async (path, options = {}) => {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (error) {
    const parts = []
    if (error instanceof Error) {
      parts.push(error.message)
      const nestedCause = error.cause
      if (nestedCause instanceof Error) {
        parts.push(nestedCause.message)
        if (nestedCause.code) parts.push(`code=${nestedCause.code}`)
      } else if (nestedCause) {
        parts.push(String(nestedCause))
      }
      if (error.code) parts.push(`code=${error.code}`)
    } else {
      parts.push('Unknown fetch error')
    }
    const e = new Error(`Network error calling Postmark (${path}): ${parts.join(' | ')}`)
    throw e
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  if (!response.ok) {
    const error = new Error(data?.Message || `Postmark request failed (${response.status})`)
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}

const listAllTemplates = async () => {
  const all = []
  let offset = 0
  const count = 100

  while (true) {
    const data = await postmarkRequest(
      `/templates?count=${count}&offset=${offset}&TemplateType=All`
    )
    const rows = Array.isArray(data?.Templates) ? data.Templates : []
    all.push(...rows)
    const total = Number(data?.TotalCount || rows.length)
    offset += rows.length
    if (rows.length === 0 || offset >= total) break
  }

  return all
}

const buildTemplatePayload = (template) => {
  const payload = {
    Name: template.name,
    Subject: template.subject,
    HtmlBody: template.htmlBody,
    TextBody: template.textBody,
    Alias: template.alias,
    TemplateType: 'Standard',
  }
  if (POSTMARK_LAYOUT_ALIAS) {
    payload.LayoutTemplate = POSTMARK_LAYOUT_ALIAS
  }
  return payload
}

const syncTemplate = async (template, templateIdByAlias) => {
  const payload = buildTemplatePayload(template)
  const existingId = templateIdByAlias.get(template.alias) || null

  if (DRY_RUN) {
    console.log(
      `[dry-run] ${existingId ? 'update' : 'create'} ${template.alias}${existingId ? ` (id ${existingId})` : ''}`
    )
    return
  }

  if (existingId) {
    await postmarkRequest(`/templates/${existingId}`, { method: 'PUT', body: payload })
    console.log(`updated ${template.alias}`)
    return
  }

  await postmarkRequest('/templates', { method: 'POST', body: payload })
  console.log(`created ${template.alias}`)
}

const run = async () => {
  console.log(`Syncing ${templates.length} Postmark templates${DRY_RUN ? ' (dry-run)' : ''}...`)
  if (POSTMARK_LAYOUT_ALIAS) {
    console.log(`Using layout alias: ${POSTMARK_LAYOUT_ALIAS}`)
  }
  console.log(`Template source: ${TEMPLATE_FILE}`)

  const templateIdByAlias = new Map()
  if (!DRY_RUN) {
    const existingTemplates = await listAllTemplates()
    for (const row of existingTemplates) {
      if (!row?.Alias || !row?.TemplateId) continue
      templateIdByAlias.set(String(row.Alias), Number(row.TemplateId))
    }
  }

  for (const template of templates) {
    await syncTemplate(template, templateIdByAlias)
  }

  console.log('Postmark template sync complete.')
}

run().catch((error) => {
  console.error('Template sync failed:', error.message)
  if (error.payload) {
    console.error(JSON.stringify(error.payload, null, 2))
  }
  process.exit(1)
})

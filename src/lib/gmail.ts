const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

const requireEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

export const getGmailAccessToken = async () => {
  const clientId = requireEnv('GMAIL_CLIENT_ID')
  const clientSecret = requireEnv('GMAIL_CLIENT_SECRET')
  const refreshToken = requireEnv('GMAIL_REFRESH_TOKEN')

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error_description || 'Unable to refresh Gmail token')
  }

  const data = await response.json()
  return data.access_token as string
}

const gmailFetch = async (path: string, init?: RequestInit) => {
  const accessToken = await getGmailAccessToken()
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error?.message || 'Gmail API request failed')
  }
  return response.json()
}

export const gmailRequest = async (path: string) => {
  return gmailFetch(path)
}

export const listHistory = async (email: string, startHistoryId: string) => {
  const query = new URLSearchParams({
    startHistoryId,
    historyTypes: 'messageAdded',
  })
  return gmailRequest(`/users/${encodeURIComponent(email)}/history?${query.toString()}`)
}

export const listUnreadMessages = async (email: string) => {
  const query = new URLSearchParams({
    q: 'is:unread label:inbox',
  })
  return gmailRequest(`/users/${encodeURIComponent(email)}/messages?${query.toString()}`)
}

export const getMessage = async (email: string, messageId: string) => {
  return gmailRequest(`/users/${encodeURIComponent(email)}/messages/${messageId}?format=full`)
}

export const watchInbox = async (email: string, topicName: string) => {
  return gmailFetch(`/users/${encodeURIComponent(email)}/watch`, {
    method: 'POST',
    body: JSON.stringify({
      topicName,
      labelIds: ['INBOX'],
      labelFilterAction: 'include',
    }),
  })
}

export const listLabels = async (email: string) => {
  return gmailRequest(`/users/${encodeURIComponent(email)}/labels`)
}

export const createLabel = async (email: string, name: string) => {
  return gmailFetch(`/users/${encodeURIComponent(email)}/labels`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    }),
  })
}

export const ensureLabelId = async (email: string, name: string) => {
  const data = await listLabels(email)
  const existing = (data.labels || []).find((label: any) => label.name === name)
  if (existing?.id) return existing.id as string
  const created = await createLabel(email, name)
  return created.id as string
}

export const modifyMessageLabels = async (email: string, messageId: string, labelName: string) => {
  const labelId = await ensureLabelId(email, labelName)
  await gmailFetch(`/users/${encodeURIComponent(email)}/messages/${messageId}/modify`, {
    method: 'POST',
    body: JSON.stringify({
      addLabelIds: [labelId],
      removeLabelIds: ['UNREAD'],
    }),
  })
}

export const extractHeader = (headers: Array<{ name: string; value: string }>, key: string) => {
  const match = headers.find((header) => header.name.toLowerCase() === key.toLowerCase())
  return match?.value || ''
}

export const parseEmailAddress = (value: string) => {
  const match = value.match(/<([^>]+)>/)
  if (match?.[1]) return match[1]
  return value.trim()
}

const decodeBase64 = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

export const extractMessageBody = (payload: any) => {
  if (!payload) return ''
  const queue = [payload]
  let plainText = ''
  let htmlText = ''
  while (queue.length) {
    const part = queue.shift()
    if (!part) continue
    if (part.parts && Array.isArray(part.parts)) {
      queue.push(...part.parts)
    }
    if (part.mimeType === 'text/plain' && part.body?.data) {
      plainText += decodeBase64(part.body.data)
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      htmlText += decodeBase64(part.body.data)
    }
  }
  const body = plainText.trim() || stripHtml(htmlText)
  return body.trim()
}

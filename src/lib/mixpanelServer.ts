type MixpanelPrimitive = string | number | boolean | null
type MixpanelPropertyValue = MixpanelPrimitive | MixpanelPrimitive[]

type TrackMixpanelServerEventParams = {
  event: string
  distinctId?: string | null
  properties?: Record<string, MixpanelPropertyValue | undefined>
}

const MIXPANEL_TRACK_URL = 'https://api.mixpanel.com/track?verbose=1'

const sanitizePropertyValue = (value: MixpanelPropertyValue | undefined): MixpanelPropertyValue | undefined => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (entry === null) return null
        if (['string', 'number', 'boolean'].includes(typeof entry)) return entry
        return String(entry)
      })
      .filter((entry) => entry !== undefined) as MixpanelPrimitive[]
  }
  if (['string', 'number', 'boolean'].includes(typeof value)) return value
  return String(value)
}

const sanitizeProperties = (properties?: Record<string, MixpanelPropertyValue | undefined>) => {
  const sanitized: Record<string, MixpanelPropertyValue> = {}

  Object.entries(properties || {}).forEach(([key, value]) => {
    const normalized = sanitizePropertyValue(value)
    if (normalized !== undefined) {
      sanitized[key] = normalized
    }
  })

  return sanitized
}

export async function trackMixpanelServerEvent({
  event,
  distinctId,
  properties,
}: TrackMixpanelServerEventParams) {
  const token = String(
    process.env.MIXPANEL_PROJECT_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || ''
  ).trim()
  if (!token || !event) return

  const payload = [
    {
      event,
      properties: {
        token,
        distinct_id: String(distinctId || 'server'),
        time: Math.floor(Date.now() / 1000),
        $insert_id: crypto.randomUUID(),
        source: 'server',
        ...sanitizeProperties(properties),
      },
    },
  ]

  try {
    const response = await fetch(MIXPANEL_TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    if (!response.ok) {
      console.warn('[mixpanel] server track failed', event, response.status)
    }
  } catch (error) {
    console.warn('[mixpanel] server track error', event, error)
  }
}

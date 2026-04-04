'use client'

const INVALID_JWT_MARKERS = [
  'invalidjwttoken',
  'invalid value for jwt claim "exp"',
  'jwt claim "exp"',
]

const LOGIN_ERROR = 'Your session expired. Please sign in again.'

const hasInvalidJwtMarker = (value: string) => {
  const normalized = value.toLowerCase()
  return INVALID_JWT_MARKERS.some((marker) => normalized.includes(marker))
}

export const isInvalidJwtSessionError = (error: unknown) => {
  if (!error) return false
  if (typeof error === 'string') return hasInvalidJwtMarker(error)
  if (error instanceof Error) return hasInvalidJwtMarker(error.message)
  if (typeof error === 'object') {
    const message = 'message' in error ? String((error as { message?: unknown }).message || '') : ''
    const name = 'name' in error ? String((error as { name?: unknown }).name || '') : ''
    return hasInvalidJwtMarker(`${name} ${message}`)
  }
  return false
}

const clearCookie = (name: string) => {
  const encodedName = encodeURIComponent(name)
  document.cookie = `${encodedName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
  document.cookie = `${encodedName}=; path=/; domain=${window.location.hostname}; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}

export const clearSupabaseBrowserSessionArtifacts = () => {
  if (typeof window === 'undefined') return

  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keysToRemove: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key) continue
      if (key.startsWith('sb-') || key.includes('supabase.auth') || key.includes('-auth-token')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key))
  }

  document.cookie.split(';').forEach((rawCookie) => {
    const [rawName] = rawCookie.split('=')
    const name = rawName?.trim()
    if (!name) return
    if (name.startsWith('sb-') || name.includes('supabase') || name.includes('auth-token')) {
      clearCookie(name)
    }
  })
}

export const recoverFromInvalidBrowserSession = async () => {
  if (typeof window === 'undefined') return
  const globalRef = window as Window & { __CH_INVALID_SESSION_RECOVERY__?: boolean }
  if (globalRef.__CH_INVALID_SESSION_RECOVERY__) return
  globalRef.__CH_INVALID_SESSION_RECOVERY__ = true

  clearSupabaseBrowserSessionArtifacts()
  window.dispatchEvent(new CustomEvent('ch:auth-session-recovered'))

  const loginUrl = new URL('/login', window.location.origin)
  loginUrl.searchParams.set('error', LOGIN_ERROR)
  const currentPath = `${window.location.pathname}${window.location.search}`
  if (currentPath !== '/login' && currentPath !== '/login?') {
    loginUrl.searchParams.set('next', currentPath)
  }
  window.location.replace(loginUrl.toString())
}

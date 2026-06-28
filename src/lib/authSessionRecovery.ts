'use client'

const INVALID_JWT_MARKERS = [
  'authsessionmissingerror',
  'invalidjwttoken',
  'invalid value for jwt claim "exp"',
  'jwt claim "exp"',
  'invalid refresh token',
  'refresh token not found',
  'refresh_token_not_found',
  'refresh token already used',
  'session missing',
  'session_not_found',
]

const LOGIN_ERROR = 'Your session expired. Please sign in again.'
const AUTH_NETWORK_MARKERS = [
  'failed to fetch',
  'fetch failed',
  'networkerror',
  'network error',
  'load failed',
]

const AUTH_LOCK_ERROR_MARKERS = [
  'lock broken by another request',
  'lock "lock:',
  'released because another request stole it',
]

const SUPABASE_AUTH_STACK_MARKERS = [
  'supabase_auth',
  'supabase-auth',
  '@supabase/auth',
  'gotrue',
  '_refreshaccesstoken',
  '_recoverandrefresh',
  '_callrefreshtoken',
]

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
    const code = 'code' in error ? String((error as { code?: unknown }).code || '') : ''
    const errorCode = 'error_code' in error ? String((error as { error_code?: unknown }).error_code || '') : ''
    return hasInvalidJwtMarker(`${name} ${message} ${code} ${errorCode}`)
  }
  return false
}

export const isTransientSupabaseAuthNetworkError = (error: unknown) => {
  if (!error) return false
  const parts: string[] = []

  if (typeof error === 'string') {
    parts.push(error)
  } else if (error instanceof Error) {
    parts.push(error.name, error.message, error.stack || '')
  } else if (typeof error === 'object') {
    parts.push(
      String((error as { name?: unknown }).name || ''),
      String((error as { message?: unknown }).message || ''),
      String((error as { stack?: unknown }).stack || ''),
      String((error as { code?: unknown }).code || ''),
      String((error as { error_code?: unknown }).error_code || ''),
    )
  }

  const value = parts.join(' ').toLowerCase()
  const isNetworkFailure = AUTH_NETWORK_MARKERS.some((marker) => value.includes(marker))
  if (!isNetworkFailure) return false

  return SUPABASE_AUTH_STACK_MARKERS.some((marker) => value.includes(marker))
}

export const isSupabaseBrowserAuthLockError = (error: unknown) => {
  if (!error) return false
  const parts: string[] = []

  if (typeof error === 'string') {
    parts.push(error)
  } else if (error instanceof Error) {
    parts.push(error.name, error.message, error.stack || '')
  } else if (typeof error === 'object') {
    parts.push(
      String((error as { name?: unknown }).name || ''),
      String((error as { message?: unknown }).message || ''),
      String((error as { stack?: unknown }).stack || ''),
      String((error as { code?: unknown }).code || ''),
    )
  }

  const value = parts.join(' ').toLowerCase()
  return AUTH_LOCK_ERROR_MARKERS.some((marker) => value.includes(marker))
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

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import {
  isInvalidJwtSessionError,
  isSupabaseBrowserAuthLockError,
  isTransientSupabaseAuthNetworkError,
  recoverFromInvalidBrowserSession,
} from '@/lib/authSessionRecovery'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
const invalidSessionFallbackSubscription = {
  data: {
    subscription: {
      unsubscribe() {},
    },
  },
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const withBrowserAuthRecovery = async <T>(operation: () => Promise<T>, fallback: T) => {
  try {
    return await operation()
  } catch (error) {
    if (isInvalidJwtSessionError(error)) {
      await recoverFromInvalidBrowserSession()
      return fallback
    }

    if (isTransientSupabaseAuthNetworkError(error)) {
      return fallback
    }

    if (isSupabaseBrowserAuthLockError(error)) {
      await sleep(60)
      try {
        return await operation()
      } catch (retryError) {
        if (isInvalidJwtSessionError(retryError)) {
          await recoverFromInvalidBrowserSession()
          return fallback
        }
        if (isSupabaseBrowserAuthLockError(retryError)) {
          return fallback
        }
        if (isTransientSupabaseAuthNetworkError(retryError)) {
          return fallback
        }
        throw retryError
      }
    }

    throw error
  }
}

const wrapBrowserAuthClient = <T extends { auth: ReturnType<typeof createClientComponentClient>['auth'] }>(client: T) => {
  const auth = client.auth as typeof client.auth & { __chWrapped?: boolean }
  if (auth.__chWrapped) return client
  auth.__chWrapped = true

  const rawGetSession = auth.getSession.bind(auth)
  const invalidSessionFallbackSession = {
    data: { session: null },
    error: null,
  } as Awaited<ReturnType<typeof rawGetSession>>
  auth.getSession = (() =>
    withBrowserAuthRecovery(rawGetSession, invalidSessionFallbackSession)) as typeof auth.getSession

  const rawGetUser = auth.getUser.bind(auth)
  const invalidSessionFallbackUser = {
    data: { user: null },
    error: null,
  } as unknown as Awaited<ReturnType<typeof rawGetUser>>
  auth.getUser = ((jwt?: string) =>
    withBrowserAuthRecovery(() => rawGetUser(jwt), invalidSessionFallbackUser)) as typeof auth.getUser

  const rawRefreshSession = auth.refreshSession.bind(auth)
  const invalidSessionFallbackRefresh = {
    data: { session: null, user: null },
    error: null,
  } as Awaited<ReturnType<typeof rawRefreshSession>>
  auth.refreshSession = ((currentSession?: Parameters<typeof rawRefreshSession>[0]) =>
    withBrowserAuthRecovery(() => rawRefreshSession(currentSession), invalidSessionFallbackRefresh)) as typeof auth.refreshSession

  const rawOnAuthStateChange = auth.onAuthStateChange.bind(auth)
  auth.onAuthStateChange = ((callback: Parameters<typeof rawOnAuthStateChange>[0]) => {
    try {
      return rawOnAuthStateChange((event, session) => {
        try {
          callback(event, session)
        } catch (error) {
          if (isInvalidJwtSessionError(error)) {
            void recoverFromInvalidBrowserSession()
            return
          }
          throw error
        }
      })
    } catch (error) {
      if (!isInvalidJwtSessionError(error)) throw error
      void recoverFromInvalidBrowserSession()
      return invalidSessionFallbackSubscription
    }
  }) as typeof auth.onAuthStateChange

  return client
}

let browserSupabaseClient: ReturnType<typeof createClientComponentClient> | null = null
let browserAuthRecoveryListenerInstalled = false

const installBrowserAuthRecoveryListener = () => {
  if (typeof window === 'undefined' || browserAuthRecoveryListenerInstalled) return
  browserAuthRecoveryListenerInstalled = true

  window.addEventListener('unhandledrejection', (event) => {
    if (isTransientSupabaseAuthNetworkError(event.reason)) {
      event.preventDefault()
      return
    }
    if (isSupabaseBrowserAuthLockError(event.reason)) {
      event.preventDefault()
      return
    }
    if (!isInvalidJwtSessionError(event.reason)) return
    event.preventDefault()
    void recoverFromInvalidBrowserSession()
  })

  window.addEventListener('error', (event) => {
    const error = event.error || event.message
    if (isTransientSupabaseAuthNetworkError(error)) {
      event.preventDefault()
      return
    }
    if (isSupabaseBrowserAuthLockError(error)) {
      event.preventDefault()
      return
    }
    if (!isInvalidJwtSessionError(error)) return
    event.preventDefault()
    void recoverFromInvalidBrowserSession()
  })
}

/**
 * Wraps createClientComponentClient with explicit URL/key so it never
 * throws when env vars are not yet injected during SSR/build.
 * On the browser we keep a singleton client so parallel portal/admin components
 * do not compete over Supabase auth storage locks.
 */
export function createSafeClientComponentClient() {
  if (typeof window === 'undefined') {
    const client = createClientComponentClient({ supabaseUrl, supabaseKey })
    return wrapBrowserAuthClient(client)
  }

  installBrowserAuthRecoveryListener()

  if (!browserSupabaseClient) {
    browserSupabaseClient = createClientComponentClient({ supabaseUrl, supabaseKey })
  }

  return wrapBrowserAuthClient(browserSupabaseClient)
}

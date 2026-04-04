import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { isInvalidJwtSessionError, recoverFromInvalidBrowserSession } from '@/lib/authSessionRecovery'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'

const invalidSessionFallbackSubscription = {
  data: {
    subscription: {
      unsubscribe() {},
    },
  },
}

const withInvalidSessionRecovery = async <T>(operation: () => Promise<T>, fallback: T) => {
  try {
    return await operation()
  } catch (error) {
    if (!isInvalidJwtSessionError(error)) throw error
    await recoverFromInvalidBrowserSession()
    return fallback
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
    withInvalidSessionRecovery(rawGetSession, invalidSessionFallbackSession)) as typeof auth.getSession

  const rawGetUser = auth.getUser.bind(auth)
  const invalidSessionFallbackUser = {
    data: { user: null },
    error: null,
  } as unknown as Awaited<ReturnType<typeof rawGetUser>>
  auth.getUser = ((jwt?: string) =>
    withInvalidSessionRecovery(() => rawGetUser(jwt), invalidSessionFallbackUser)) as typeof auth.getUser

  const rawRefreshSession = auth.refreshSession.bind(auth)
  const invalidSessionFallbackRefresh = {
    data: { session: null, user: null },
    error: null,
  } as Awaited<ReturnType<typeof rawRefreshSession>>
  auth.refreshSession = ((currentSession?: Parameters<typeof rawRefreshSession>[0]) =>
    withInvalidSessionRecovery(() => rawRefreshSession(currentSession), invalidSessionFallbackRefresh)) as typeof auth.refreshSession

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

/**
 * Wraps createClientComponentClient with explicit URL/key so it never
 * throws when env vars are not yet injected during SSR/build.
 */
export function createSafeClientComponentClient() {
  const client = createClientComponentClient({ supabaseUrl, supabaseKey })
  return wrapBrowserAuthClient(client)
}

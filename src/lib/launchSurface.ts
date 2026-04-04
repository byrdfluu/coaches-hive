export const launchSurface = {
  publicOrgEntryPointsEnabled: process.env.NEXT_PUBLIC_ENABLE_PUBLIC_ORGS === '1',
  publicGuardianEntryPointsEnabled: process.env.NEXT_PUBLIC_ENABLE_PUBLIC_GUARDIANS === '1',
} as const

export const isCoachAthleteLaunch = !launchSurface.publicOrgEntryPointsEnabled

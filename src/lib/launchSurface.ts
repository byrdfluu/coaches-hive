export const launchSurface = {
  publicOrgEntryPointsEnabled: process.env.NEXT_PUBLIC_ENABLE_PUBLIC_ORGS !== '0',
} as const

export const isCoachAthleteLaunch = !launchSurface.publicOrgEntryPointsEnabled

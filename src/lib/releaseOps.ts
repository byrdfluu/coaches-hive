import { getAdminConfig, getDefaultAdminConfig, setAdminConfig } from '@/lib/adminConfig'

export type FeatureFlag = {
  key: string
  enabled: boolean
  rollout_percent: number
  owner: string
}

export type StagedRollout = {
  id: string
  name: string
  percent: number
  status: 'planned' | 'active' | 'paused'
  owner: string
}

export type PostDeployCheck = {
  id: string
  label: string
  status: 'pending' | 'pass' | 'fail'
}

export type ReleaseOpsConfig = {
  featureFlags: FeatureFlag[]
  stagedRollouts: StagedRollout[]
  migrationChecks: string[]
  rollbackPlaybook: string[]
  postDeployChecks: PostDeployCheck[]
}

const normalizePercent = (value: unknown, fallback = 100) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.min(100, Math.round(num)))
}

const normalizeReleaseOps = (config: unknown): ReleaseOpsConfig => {
  const defaults = getDefaultAdminConfig<ReleaseOpsConfig>('release_ops')
  const source = (config && typeof config === 'object' ? config : {}) as Partial<ReleaseOpsConfig>
  const flags = Array.isArray(source.featureFlags) ? source.featureFlags : defaults.featureFlags
  const rollouts = Array.isArray(source.stagedRollouts) ? source.stagedRollouts : defaults.stagedRollouts
  const migrationChecks = Array.isArray(source.migrationChecks) ? source.migrationChecks : defaults.migrationChecks
  const rollbackPlaybook = Array.isArray(source.rollbackPlaybook) ? source.rollbackPlaybook : defaults.rollbackPlaybook
  const postDeployChecks = Array.isArray(source.postDeployChecks) ? source.postDeployChecks : defaults.postDeployChecks

  return {
    featureFlags: flags.map((flag) => ({
      key: String(flag.key || '').trim(),
      enabled: Boolean(flag.enabled),
      rollout_percent: normalizePercent(flag.rollout_percent, 100),
      owner: String(flag.owner || 'Engineering'),
    })).filter((flag) => Boolean(flag.key)),
    stagedRollouts: rollouts.map((rollout) => ({
      id: String(rollout.id || '').trim(),
      name: String(rollout.name || 'Unnamed rollout'),
      percent: normalizePercent(rollout.percent, 0),
      status: rollout.status === 'active' || rollout.status === 'paused' ? rollout.status : 'planned',
      owner: String(rollout.owner || 'Engineering'),
    })),
    migrationChecks: migrationChecks.map((entry) => String(entry)).filter(Boolean),
    rollbackPlaybook: rollbackPlaybook.map((entry) => String(entry)).filter(Boolean),
    postDeployChecks: postDeployChecks.map((check) => ({
      id: String(check.id || '').trim(),
      label: String(check.label || 'Unnamed check'),
      status: (check.status === 'pass' || check.status === 'fail'
        ? check.status
        : 'pending') as PostDeployCheck['status'],
    })).filter((check) => Boolean(check.id)),
  }
}

export const getReleaseOpsConfig = async () => {
  const config = await getAdminConfig<ReleaseOpsConfig>('release_ops')
  return normalizeReleaseOps(config)
}

export const saveReleaseOpsConfig = async (config: ReleaseOpsConfig) => {
  const normalized = normalizeReleaseOps(config)
  await setAdminConfig('release_ops', normalized as unknown as Record<string, any>)
  return normalized
}

const bucketForValue = (value: string) => {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash % 100)
}

export const isFeatureEnabledForSubject = ({
  config,
  key,
  subject,
}: {
  config: ReleaseOpsConfig
  key: string
  subject: string
}) => {
  const flag = config.featureFlags.find((item) => item.key === key)
  if (!flag || !flag.enabled) return false
  if (flag.rollout_percent >= 100) return true
  if (flag.rollout_percent <= 0) return false
  return bucketForValue(`${key}:${subject}`) < flag.rollout_percent
}

export const isFeatureEnabled = async ({
  key,
  subject,
}: {
  key: string
  subject: string
}) => {
  const config = await getReleaseOpsConfig()
  return isFeatureEnabledForSubject({ config, key, subject })
}

export const updatePostDeployCheckStatus = async ({
  checkId,
  status,
}: {
  checkId: string
  status: 'pending' | 'pass' | 'fail'
}) => {
  const config = await getReleaseOpsConfig()
  const next = {
    ...config,
    postDeployChecks: config.postDeployChecks.map((check) =>
      check.id === checkId
        ? { ...check, status }
        : check
    ),
  }
  return saveReleaseOpsConfig(next)
}

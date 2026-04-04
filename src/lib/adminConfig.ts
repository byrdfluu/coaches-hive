import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { SUPPORT_TEMPLATES } from '@/lib/supportTemplates'

export type AdminConfigKey =
  | 'support'
  | 'automations'
  | 'playbook'
  | 'uptime'
  | 'operations'
  | 'release_ops'
  | 'dispute_settings'
  | 'notices'
  | 'security'
  | 'payout_ops'
  | 'verification_ops'

const DEFAULT_CONFIGS: Record<AdminConfigKey, any> = {
  support: {
    intakeChannels: [],
    triageColumns: [],
    templates: SUPPORT_TEMPLATES,
    escalations: [],
  },
  automations: {
    onboardingFlows: [
      {
        id: 'onboarding_drip_sequence',
        title: 'Onboarding drip sequence',
        trigger: 'New user signup',
        touchpoints: 'Welcome, setup reminder, activation follow-up',
        status: 'Active',
      },
    ],
    retentionAutomations: [
      {
        id: 'failed_payment_warning',
        title: 'Failed payment warning',
        trigger: 'Stripe payment failure or past_due subscription',
        cadence: 'Immediate warning + retry follow-up',
        status: 'Active',
      },
      {
        id: 'inactive_user_reengagement',
        title: 'Re-engagement (inactive user)',
        trigger: 'No session, booking, or message activity in 21 days',
        cadence: 'Email nudge and ops review queue',
        status: 'Active',
      },
    ],
    scheduledRuns: [
      {
        id: 'onboarding_drip_sequence',
        name: 'Onboarding drip sequence',
        nextRun: 'Daily',
        audience: 'New coaches and athletes',
        lastRun: null,
      },
      {
        id: 'failed_payment_warning',
        name: 'Failed payment warning',
        nextRun: 'Hourly',
        audience: 'Users with failed or past-due payments',
        lastRun: null,
      },
      {
        id: 'inactive_user_reengagement',
        name: 'Re-engagement (inactive user)',
        nextRun: 'Weekly',
        audience: 'Inactive coaches and athletes',
        lastRun: null,
      },
    ],
    alertingRules: [
      'Onboarding drip failures open an operations task.',
      'Failed payment warnings notify support ops after repeated failures.',
      'Inactive-user re-engagement runs are logged for audit visibility.',
    ],
  },
  playbook: {
    sopLibrary: [],
    sopDetails: {},
    weeklyCadence: [],
    incidentChecklist: [],
  },
  uptime: {
    uptimeStats: [],
    incidents: [],
  },
  operations: {
    lifecycleStages: [],
    controls: [],
    taskQueue: [],
    incidentFeed: [],
  },
  release_ops: {
    featureFlags: [],
    stagedRollouts: [],
    migrationChecks: [],
    rollbackPlaybook: [],
    postDeployChecks: [],
  },
  dispute_settings: {
    autoResolveEnabled: true,
    autoRefundLimit: 50,
    autoNotifyEnabled: true,
  },
  notices: {
    items: [],
  },
  security: {
    enforce_mfa: false,
    require_sso: false,
    disable_password: false,
    dual_approval_payouts: false,
    ip_allowlist: '',
    pending_payout_approvals: [],
  },
  payout_ops: {
    hold_payout_ids: [],
    failure_reasons: {},
    reconciliation: {
      last_run_at: null,
      mismatch_count: 0,
      mismatch_sample_ids: [],
      last_run_by: null,
    },
  },
  verification_ops: {
    by_user: {},
  },
}

export const getAdminConfig = async <T = any>(key: AdminConfigKey): Promise<T> => {
  const { data, error } = await supabaseAdmin
    .from('admin_configs')
    .select('data')
    .eq('key', key)
    .maybeSingle()
  if (error) {
    return DEFAULT_CONFIGS[key] as T
  }
  return ((data?.data as T) ?? DEFAULT_CONFIGS[key]) as T
}

export const setAdminConfig = async (key: AdminConfigKey, data: Record<string, any>) => {
  const { error } = await supabaseAdmin
    .from('admin_configs')
    .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) {
    throw error
  }
  return data
}

export const getDefaultAdminConfig = <T = any>(key: AdminConfigKey): T => {
  return DEFAULT_CONFIGS[key] as T
}

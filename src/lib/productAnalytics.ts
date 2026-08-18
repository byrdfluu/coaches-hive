import { getPostHogClient } from '@/lib/posthog-server'

export const PRODUCT_EVENTS={
  roster_player_added:['org_id','team_id','player_count_after'],schedule_created:['org_id','team_id','event_type'],payment_processed:['org_id','transaction_type','amount_cents','is_first_payment'],registration_link_created:['org_id','team_id'],registration_completed:['org_id','player_id','registration_source'],waiver_signed:['org_id','player_id'],
  user_login:['user_role','platform'],dashboard_viewed:['user_role','dashboard_type'],message_sent:['org_id','recipient_count','message_type'],payment_reminder_sent:['org_id','reminder_type','amount_outstanding_cents'],roster_exported:['org_id','format'],schedule_shared:['org_id','share_method'],
  referral_link_generated:['source_type','org_id'],referral_link_clicked:['source_org_id'],referral_converted:['source_org_id','new_org_id'],org_coach_invited:['org_id','coach_count_after'],org_upgraded:['from_plan','to_plan'],
  subscription_started:['org_id','plan_type','amount_cents'],subscription_canceled:['org_id','plan_type','reason'],subscription_renewed:['org_id','plan_type','months_active'],platform_fee_earned:['org_id','transaction_type','fee_amount_cents'],
} as const
export type ProductEventName=keyof typeof PRODUCT_EVENTS
export const CLIENT_PRODUCT_EVENTS=new Set<ProductEventName>(['user_login','dashboard_viewed','roster_exported','schedule_shared','referral_link_generated','referral_link_clicked'])

export function captureProductEvent(distinctId:string,event:ProductEventName,properties:Record<string,unknown>){
  const allowed=new Set<string>(PRODUCT_EVENTS[event]);const clean:Record<string,string|number|boolean|null>={}
  for(const[key,value]of Object.entries(properties)){if(allowed.has(key)&&(value===null||['string','number','boolean'].includes(typeof value)))clean[key]=value as string|number|boolean|null}
  getPostHogClient().capture({distinctId,event,properties:clean})
}

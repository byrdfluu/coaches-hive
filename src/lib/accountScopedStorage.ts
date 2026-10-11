export const accountScopedStorageKey=(key:string,userId:string)=>`${key}:${userId}`

export const ACCOUNT_SCOPED_STORAGE_PREFIXES=[
 'ch_onboarding_','ch_reviewed_','ch_active_athlete_profile_id','ch_active_sub_profile_id',
 'ch_main_athlete_label','ch_full_name','ch_avatar_url','ch_from_coach','ch_from_org',
 'athlete-marketplace-','ch_workspace_','ch_onboarding_draft_',
]

export function clearAccountScopedBrowserState(storage:Storage){
 const remove:string[]=[]
 for(let index=0;index<storage.length;index+=1){const key=storage.key(index);if(key&&ACCOUNT_SCOPED_STORAGE_PREFIXES.some(prefix=>key.startsWith(prefix)))remove.push(key)}
 remove.forEach(key=>storage.removeItem(key))
}

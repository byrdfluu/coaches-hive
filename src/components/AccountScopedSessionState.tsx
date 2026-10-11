'use client'
import{useEffect}from'react'
import{createSafeClientComponentClient}from'@/lib/supabaseHelpers'
import{clearAccountScopedBrowserState}from'@/lib/accountScopedStorage'

const USER_MARKER='ch_auth_user_id'
export default function AccountScopedSessionState(){useEffect(()=>{const supabase=createSafeClientComponentClient();const apply=(userId:string|null)=>{const previous=window.localStorage.getItem(USER_MARKER);if(previous&&previous!==userId){clearAccountScopedBrowserState(window.localStorage);clearAccountScopedBrowserState(window.sessionStorage);window.dispatchEvent(new CustomEvent('ch:account-scope-changed',{detail:{previous_user_id:previous,next_user_id:userId}}))}if(userId)window.localStorage.setItem(USER_MARKER,userId);else window.localStorage.removeItem(USER_MARKER)};void supabase.auth.getUser().then(({data})=>apply(data.user?.id||null));const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>apply(session?.user?.id||null));return()=>subscription.unsubscribe()},[]);return null}

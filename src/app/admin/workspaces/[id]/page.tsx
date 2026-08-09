'use client'

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import AdminSidebar from '@/components/AdminSidebar'
import LoadingState from '@/components/LoadingState'

const value = (input: unknown) => typeof input === 'object' ? JSON.stringify(input) : String(input ?? '—')

export default function AdminWorkspaceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/admin/workspaces/${id}`, { cache: 'no-store' })
    const payload = await response.json().catch(() => ({}))
    setData(response.ok ? payload : null); setNotice(response.ok ? '' : payload.error || 'Unable to load workspace.'); setLoading(false)
  }, [id])
  useEffect(() => { void load() }, [load])
  const act = async (action: string, fields: Record<string, unknown>) => {
    const reason = window.prompt('Reason for this audited change')?.trim()
    if (!reason) return
    const response = await fetch(`/api/admin/workspaces/${id}/actions`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action, reason, ...fields }) })
    const payload = await response.json().catch(() => ({}))
    setNotice(response.ok ? 'Workspace updated and audit event recorded.' : payload.error || 'Unable to update workspace.')
    if (response.ok) await load()
  }
  const editMembership = (membership: any) => {
    const rolesText = window.prompt('Comma-separated workspace roles', (membership.roles || []).join(','))
    if (rolesText === null) return
    const permissionsText = window.prompt('Permissions JSON', JSON.stringify(membership.permissions || {}))
    if (permissionsText === null) return
    try { void act('update_membership', { membership_id: membership.id, roles: rolesText.split(',').map((r)=>r.trim()).filter(Boolean), permissions: JSON.parse(permissionsText), status: membership.status }) }
    catch { setNotice('Permissions must be valid JSON.') }
  }
  const sections = data ? [
    ['Members', data.members, ['user_id','roles','permissions','status']],
    ['Athletes', data.athletes, ['athlete_id','relationship_type','status','created_at']],
    ['Athlete access requests', data.requests, ['id','athlete_id','athlete_email','status','reason','created_at']],
    ['Subscriptions', data.subscriptions, ['tier','status','purchase_channel','stripe_customer_id','stripe_subscription_id']],
    ['Connect accounts', data.connect_accounts, ['stripe_account_id','connect_status','charges_enabled','payouts_enabled','requirements_due']],
    ['Checkout handoffs', data.checkout_handoffs, ['checkout_type','status','stripe_checkout_session_id','last_error','created_at']],
    ['Payment accounting', data.operational_records, ['checkout_type','stripe_payment_intent_id','gross_amount_cents','platform_fee_cents','net_amount_cents']],
    ['Refunds', data.refunds, ['payment_type','status','amount','stripe_refund_id','requested_at']],
    ['Disputes', data.disputes, ['stripe_dispute_id','payment_intent_id','status','reason','created_at']],
    ['Webhook diagnostics', data.webhook_events, ['event_id','event_type','status','last_error','received_at']],
    ['Workspace audit', data.audit_events, ['event_type','acting_role','record_type','record_id','metadata','occurred_at']],
    ['Unified support timeline', data.timeline, ['event_type','status','user_id','workspace_id','payment_record_id','checkout_session_id','payment_intent_id','stripe_subscription_id','stripe_customer_id','detail','occurred_at']],
  ] : []
  return <main className="page-shell"><div className="relative z-10 px-6 py-10"><div className="grid items-start gap-6 lg:grid-cols-[200px_1fr]"><AdminSidebar/><section className="min-w-0 space-y-6">
    {loading ? <LoadingState label="Loading workspace…"/> : !data ? <p>{notice || 'Workspace not found.'}</p> : <>
      <header><p className="text-xs uppercase tracking-[0.3em] text-[#6b5f55]">{data.workspace.workspace_type.replaceAll('_',' ')}</p><h1 className="display text-3xl font-semibold">{data.workspace.display_name}</h1><p className="mt-1 break-all text-xs text-[#6b5f55]">{data.workspace.id}</p></header>
      {notice ? <p className="rounded-xl border bg-white p-3 text-sm">{notice}</p> : null}
      <div className="flex flex-wrap gap-2"><span className="rounded-full border bg-white px-4 py-2 text-sm font-semibold">{data.workspace.status}</span><span className="rounded-full border bg-white px-4 py-2 text-sm">Connect: {data.workspace.connect_ready ? 'ready' : 'not ready'}</span>{data.workspace.status === 'active' ? <button onClick={()=>void act('set_workspace_status',{status:'restricted'})} className="rounded-full bg-[#b80f0a] px-4 py-2 text-sm font-semibold text-white">Suspend workspace</button> : <button onClick={()=>void act('set_workspace_status',{status:'active'})} className="rounded-full bg-[#191919] px-4 py-2 text-sm font-semibold text-white">Reactivate workspace</button>}</div>
      {sections.map(([title,rows,columns]: any)=><section key={title} className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-semibold">{title}</h2>{!rows?.length ? <p className="mt-3 text-sm text-[#6b5f55]">No records.</p> : <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr>{columns.map((column:string)=><th key={column} className="px-3 py-2 uppercase text-[#6b5f55]">{column.replaceAll('_',' ')}</th>)}{title==='Members'||title==='Athlete access requests'?<th className="px-3 py-2">Action</th>:null}</tr></thead><tbody>{rows.map((row:any,index:number)=><tr key={row.id||index} className="border-t">{columns.map((column:string)=><td key={column} className="max-w-[260px] break-words px-3 py-2">{value(row[column])}</td>)}{title==='Members'?<td><button onClick={()=>editMembership(row)} className="font-semibold text-[#b80f0a]">Edit</button></td>:title==='Athlete access requests'&&row.status==='requested'?<td className="whitespace-nowrap"><button onClick={()=>void act('resolve_athlete_request',{request_id:row.id,status:'approved'})} className="mr-2 font-semibold text-green-700">Approve</button><button onClick={()=>void act('resolve_athlete_request',{request_id:row.id,status:'rejected'})} className="font-semibold text-[#b80f0a]">Reject</button></td>:null}</tr>)}</tbody></table></div>}</section>)}
    </>}
  </section></div></div></main>
}

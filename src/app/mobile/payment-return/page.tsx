import type {Metadata} from 'next'
import MobilePaymentReturn from './MobilePaymentReturn'

export const dynamic='force-dynamic'
export const metadata:Metadata={title:'Return to Coaches Hive',robots:{index:false,follow:false}}
const uuid=(value?:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value||'')?value!.toLowerCase():''
const safeStoreUrl=(value?:string)=>{try{const url=new URL(value||'');return url.protocol==='https:'&&['apps.apple.com','testflight.apple.com'].includes(url.hostname)?url.toString():null}catch{return null}}

export default async function MobilePaymentReturnPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const params=await searchParams
  const type=String(params.type||(params.fee_id?'recurring_fee':'payment')).replace(/[^a-z0-9_]/gi,'').slice(0,40)
  const recordId=uuid(params.purchase_id)||uuid(params.subscription_record_id)||uuid(params.fee_id)||uuid(params.id)
  const status=['processing','canceled','billing_updated'].includes(String(params.status))?String(params.status):'processing'
  return <MobilePaymentReturn status={status} type={type} recordId={recordId} appStoreUrl={safeStoreUrl(process.env.NEXT_PUBLIC_APP_STORE_URL?.trim())}/>
}

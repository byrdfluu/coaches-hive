'use client'
import AdminOperationalDataPage from '@/components/AdminOperationalDataPage'
export default function Page(){return <AdminOperationalDataPage title="Checkout & Billing Failures" description="Actionable subscription, checkout handoff, and Stripe webhook failures." endpoint="/api/admin/billing-failures" columns={[{key:'occurred_at',label:'Occurred',kind:'date'},{key:'source',label:'Source'},{key:'kind',label:'Type'},{key:'status',label:'Status',kind:'status'},{key:'reference',label:'Reference'},{key:'error',label:'Error'}]}/>}

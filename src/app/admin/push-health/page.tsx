'use client'
import AdminOperationalDataPage from '@/components/AdminOperationalDataPage'
export default function Page(){return <AdminOperationalDataPage title="APNs & Push Health" description="APNs configuration readiness and registered iPhone device tokens. Tokens are masked." endpoint="/api/admin/push-health" columns={[{key:'updated_at',label:'Updated',kind:'date'},{key:'user_id',label:'User'},{key:'platform',label:'Platform'},{key:'environment',label:'Environment'},{key:'token',label:'Token'}]}/>}

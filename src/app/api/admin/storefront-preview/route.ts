import { requireSuperadminApi } from '@/lib/adminApiAuth'
import { familyStorefrontResponse } from '@/app/api/mobile/family/storefront/route'

export const dynamic='force-dynamic'
export async function GET(request:Request){
  const auth=await requireSuperadminApi(request);if(auth.error)return auth.error
  return familyStorefrontResponse(request,{trustedAdminPreview:true,previewUserId:auth.user.id})
}

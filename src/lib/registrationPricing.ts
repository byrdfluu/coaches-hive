export type RegistrationPricing = { enrollment_fee_cents?: number|null; early_bird_fee_cents?:number|null; early_bird_deadline?:string|null; late_fee_cents?:number|null; late_fee_starts_at?:string|null }
export const resolveRegistrationPrice=(form:RegistrationPricing,now=Date.now())=>{
 if(form.early_bird_fee_cents!=null&&form.early_bird_deadline&&now<=new Date(form.early_bird_deadline).getTime())return{amountCents:Number(form.early_bird_fee_cents),pricingPhase:'early_bird' as const}
 if(form.late_fee_cents!=null&&form.late_fee_starts_at&&now>=new Date(form.late_fee_starts_at).getTime())return{amountCents:Number(form.late_fee_cents),pricingPhase:'late' as const}
 return{amountCents:Number(form.enrollment_fee_cents||0),pricingPhase:'standard' as const}
}

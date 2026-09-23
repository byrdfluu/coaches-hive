import { ORGANIZATION_AGREEMENT_EFFECTIVE_DATE, ORGANIZATION_AGREEMENT_VERSION } from '@/lib/legalAgreements'

const items = [
  ['Stripe services', 'Payment processing and connected-account onboarding are provided by Stripe. Organizations must provide accurate onboarding information and comply with Stripe’s applicable terms.'],
  ['Prices and authority', 'Organizations are responsible for the prices, descriptions, eligibility, taxes, and authority associated with their programs, fees, products, and other collections.'],
  ['Fees', 'Coaches Hive may deduct the platform fee disclosed in the product or checkout flow. Stripe processing fees and other applicable charges are reflected according to the organization’s plan and payment configuration.'],
  ['Payouts', 'Payout timing and availability depend on Stripe, account verification, reserves, refunds, disputes, negative balances, and legal requirements. Coaches Hive does not guarantee a particular settlement date.'],
  ['Refunds', 'Organizations are responsible for their customer refund policies. When a destination-charge refund is approved, Coaches Hive may reverse the connected-account transfer and refund the related application fee as supported by Stripe.'],
  ['Disputes and chargebacks', 'The organization must respond promptly to evidence requests and is responsible for chargebacks, dispute losses, fees, and negative balances attributable to its transactions.'],
  ['Restrictions and holds', 'Coaches Hive or Stripe may delay, restrict, or stop payment activity when required for verification, suspected fraud, prohibited activity, security, disputes, legal process, or platform protection.'],
  ['Records', 'Stripe webhook events and Coaches Hive server records—not browser redirects—determine payment status. Organizations should reconcile payouts and report discrepancies promptly.'],
]

export default function PaymentTermsPage() {
  return <main className="page-shell public-page"><div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
    <p className="public-kicker">Legal</p><h1 className="public-title mt-2 text-4xl md:text-5xl">Payment Services Terms</h1>
    <p className="mt-3 text-xs text-[#4a4a4a]">Version {ORGANIZATION_AGREEMENT_VERSION} · Effective {ORGANIZATION_AGREEMENT_EFFECTIVE_DATE}</p>
    <p className="public-copy mt-4">These terms govern payment collection and connected-account payouts through Coaches Hive.</p>
    <div className="mt-8 space-y-5 text-sm leading-6 text-[#4a4a4a]">{items.map(([title, body], i) => <section key={title} className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">{i + 1}. {title}</h2><p className="mt-2">{body}</p></section>)}</div>
  </div></main>
}

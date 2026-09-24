import { ORGANIZATION_AGREEMENT_EFFECTIVE_DATE } from '@/lib/legalAgreements'

const providers = [
  ['Supabase', 'Database, authentication, file storage, and backend infrastructure'],
  ['Vercel', 'Application hosting, delivery, and infrastructure logs'],
  ['Stripe', 'Subscription and transaction payment processing'],
  ['Postmark', 'Transactional email delivery'],
  ['Sentry', 'Application error monitoring and diagnostics'],
  ['PostHog', 'Product analytics and service-performance measurement'],
  ['Apple', 'Mobile application services and in-app purchase infrastructure, when used'],
]

export default function SubprocessorsPage() {
  return <main className="page-shell public-page"><div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
    <p className="public-kicker">Legal</p><h1 className="public-title mt-2 text-4xl md:text-5xl">Subprocessors</h1>
    <p className="mt-3 text-xs text-[#4a4a4a]">Current as of {ORGANIZATION_AGREEMENT_EFFECTIVE_DATE}</p>
    <p className="public-copy mt-4">These providers may process customer or athlete information to operate Coaches Hive. The exact provider and processing location can vary by service configuration.</p>
    <div className="mt-8 space-y-4 text-sm text-[#4a4a4a]">{providers.map(([name, purpose]) => <section key={name} className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">{name}</h2><p className="mt-1">{purpose}</p></section>)}</div>
    <section className="mt-5 rounded-2xl border border-[#191919] bg-white p-5 text-sm text-[#4a4a4a]"><h2 className="font-semibold text-[#191919]">Change notices</h2><p className="mt-2">Organizations may request notice of material subprocessor changes by emailing <a className="text-[#b80f0a] underline" href="mailto:support@coacheshive.com?subject=Subprocessor%20change%20notices">support@coacheshive.com</a>. Objections must explain the reasonable data-protection concern.</p></section>
  </div></main>
}

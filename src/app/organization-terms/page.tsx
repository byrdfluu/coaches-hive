import Link from 'next/link'
import { ORGANIZATION_AGREEMENT_EFFECTIVE_DATE, ORGANIZATION_AGREEMENT_VERSION } from '@/lib/legalAgreements'

export default function OrganizationTermsPage() {
  return <main className="page-shell public-page"><div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
    <p className="public-kicker">Legal</p><h1 className="public-title mt-2 text-4xl md:text-5xl">Organization Terms</h1>
    <p className="mt-3 text-xs text-[#4a4a4a]">Version {ORGANIZATION_AGREEMENT_VERSION} · Effective {ORGANIZATION_AGREEMENT_EFFECTIVE_DATE}</p>
    <p className="public-copy mt-4">These terms supplement the <Link className="text-[#b80f0a] underline" href="/terms">Terms of Service</Link> for organizations using Coaches Hive.</p>
    <div className="mt-8 space-y-5 text-sm leading-6 text-[#4a4a4a]">
      <Section title="1. Authority and accounts">The person accepting these terms represents that they are authorized to bind the organization. The organization is responsible for its administrators, permissions, members, account security, and all activity performed through its workspace.</Section>
      <Section title="2. Subscription and cancellation">Organization subscriptions renew for the billing interval and price presented at checkout until canceled. Organizations may cancel online. Cancellation stops future renewal and access continues through the paid billing period. Unless required by law, unused time is not prorated or refunded.</Section>
      <Section title="3. Organization and athlete data">The organization controls the information it submits and instructs Coaches Hive to process that information to provide the service. The organization must have the necessary authority, notices, permissions, and guardian consents before uploading athlete or minor information.</Section>
      <Section title="4. Programs, registrations, and documents">The organization is responsible for its programs, eligibility rules, descriptions, prices, schedules, waivers, required documents, participant decisions, and compliance obligations. Coaches Hive provides administration tools but does not approve the organization’s legal forms or participation requirements.</Section>
      <Section title="5. Payments">Payment collection and payouts are subject to the <Link className="text-[#b80f0a] underline" href="/payment-terms">Payment Services Terms</Link>. The organization is responsible for its customer-facing prices, refund policies, taxes, chargebacks, and fulfillment obligations.</Section>
      <Section title="6. Permitted use">The organization will comply with the <Link className="text-[#b80f0a] underline" href="/safety">Acceptable Use Policy</Link>, protect credentials, assign appropriate access, and promptly remove access from people no longer authorized.</Section>
      <Section title="7. Suspension and termination">Coaches Hive may restrict access for nonpayment, unlawful conduct, security risk, fraud, or material breach. After cancellation or termination, unresolved payments, refunds, disputes, legal holds, and record-retention obligations may continue.</Section>
      <Section title="8. Data return">Organizations should export needed records before access ends. Data retention and deletion are governed by the Terms of Service, Privacy Policy, Data Processing Addendum, applicable law, and any written order form.</Section>
      <Section title="9. Order of terms">A signed order form may modify these terms for a specific organization. If no signed order form exists, the online terms and the checkout terms form the agreement.</Section>
      <Section title="10. Contact">Questions may be sent to support@coacheshive.com.</Section>
    </div>
  </div></main>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">{title}</h2><p className="mt-2">{children}</p></section>
}


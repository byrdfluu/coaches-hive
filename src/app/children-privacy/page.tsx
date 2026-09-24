import Link from 'next/link'
import { LEGAL_DOCUMENT_VERSIONS, ORGANIZATION_AGREEMENT_EFFECTIVE_DATE } from '@/lib/legalAgreements'

const sections = [
  ['Who this notice covers', 'This notice applies when Coaches Hive collects personal information about a child under 13 through a youth-sports registration or a parent- or guardian-managed player record. Children under 13 may not create or operate their own Coaches Hive accounts.'],
  ['Information we collect', 'We may collect the child’s name, date of birth, team, sport, registration and attendance information, waiver status, documents a parent chooses to submit, and payment or eligibility status. We also keep the parent or guardian’s name, contact information, consent record, and verification result. We do not ask an under-13 child for a personal email address.'],
  ['How we use it', 'We use this information to administer registrations, rosters, schedules, participation, waivers, safety and compliance workflows, payments, support, security, and records requested by the participating organization. We do not use children’s information for targeted advertising or build advertising profiles from it.'],
  ['Who receives it', 'The participating organization and its authorized coaches or administrators may receive information needed to operate the child’s program. Our service providers process limited information for hosting, authentication, payments, email, monitoring, analytics, support, and security. They may use it only to provide their services to Coaches Hive.'],
  ['Parental notice and consent', 'Before covered information is submitted for a child under 13, Coaches Hive presents this notice, requires the adult to confirm that they are the child’s parent or legal guardian, and records affirmative consent together with the notice version, confirmation language, date, and technical evidence. We may require an additional verification method when the information or proposed use requires it. Consent to any nonessential third-party disclosure would be requested separately.'],
  ['Parent controls', 'A parent or legal guardian may ask to review or correct the child’s information, revoke consent, prevent further collection or use, or request deletion. Revoking consent may make continued participation through Coaches Hive impossible. We will verify the requester’s identity before fulfilling a request.'],
  ['Retention and security', 'We retain children’s information only as reasonably necessary for the registration, participation, safety, legal, dispute, and recordkeeping purposes described at collection. We then delete or de-identify it, subject to legal holds and records that must be retained. We use access controls and technical and organizational safeguards designed to protect the information.'],
]

export default function ChildrenPrivacyPage() {
  return <main className="page-shell public-page"><div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
    <p className="public-kicker">Legal</p><h1 className="public-title mt-2 text-4xl md:text-5xl">Children&apos;s Privacy Notice</h1>
    <p className="mt-3 text-xs text-[#4a4a4a]">Version {LEGAL_DOCUMENT_VERSIONS.children_privacy_notice} · Effective {ORGANIZATION_AGREEMENT_EFFECTIVE_DATE}</p>
    <p className="public-copy mt-4">This notice explains how Coaches Hive handles information about children under 13 and the choices available to their parents and legal guardians.</p>
    <section className="mt-6 rounded-2xl border border-[#b80f0a] bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b80f0a]">COPPA Commitment</p>
      <h2 className="mt-2 text-lg font-semibold text-[#191919]">Coaches Hive follows the Children&apos;s Online Privacy Protection Act.</h2>
      <p className="mt-2 text-sm leading-6 text-[#4a4a4a]">For covered children under 13, Coaches Hive provides parents or legal guardians with direct notice, obtains verifiable parental consent before collecting personal information, limits collection and use to the purposes described in this notice, protects the information, and honors parental rights to review, correct, delete, or stop further collection. These are Coaches Hive&apos;s responsibilities and are not transferred to a sports organization.</p>
    </section>
    <div className="mt-8 space-y-5 text-sm leading-6 text-[#4a4a4a]">
      {sections.map(([title, body], index) => <section key={title} className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">{index + 1}. {title}</h2><p className="mt-2">{body}</p></section>)}
      <section className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">8. Contact us</h2><p className="mt-2">To exercise parental rights or ask a question, email <a className="text-[#b80f0a] underline" href="mailto:support@coacheshive.com">support@coacheshive.com</a>. Coaches Hive will provide its current legal entity name, postal address, and telephone contact in the production notice before collecting covered information.</p></section>
    </div>
    <p className="mt-6 text-sm text-[#4a4a4a]">See also our <Link className="text-[#b80f0a] underline" href="/privacy">Privacy Policy</Link>.</p>
  </div></main>
}

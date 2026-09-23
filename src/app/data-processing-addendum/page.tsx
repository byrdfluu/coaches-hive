import { ORGANIZATION_AGREEMENT_EFFECTIVE_DATE, ORGANIZATION_AGREEMENT_VERSION } from '@/lib/legalAgreements'

const items = [
  ['Roles and instructions', 'The organization determines the purpose of organization-submitted personal data. Coaches Hive processes that data only to provide, secure, support, and improve the contracted service, or as legally required.'],
  ['Data covered', 'Organization account data, staff and member records, athlete and guardian information, registrations, schedules, communications, waivers, documents, and payment-related records may be processed.'],
  ['Confidentiality and security', 'Coaches Hive will maintain reasonable administrative, technical, and organizational safeguards and restrict access to people and providers who need it to deliver the service.'],
  ['Minors', 'The organization must provide required notices and obtain required guardian or institutional authority before submitting minor information. This addendum does not replace guardian consent required by law.'],
  ['Service providers', 'Coaches Hive may use subprocessors for hosting, authentication, payments, email, monitoring, analytics, and customer support. They may process data only to provide their contracted services.'],
  ['Security incidents', 'Coaches Hive will notify affected organizations without unreasonable delay after confirming a security incident involving organization data, subject to legal and investigative restrictions.'],
  ['Requests and cooperation', 'Coaches Hive will provide reasonable assistance with access, correction, deletion, export, and legally required privacy requests relating to organization data.'],
  ['Return and deletion', 'Following termination, data will be returned, retained, deleted, or de-identified according to the service terms, documented retention practices, legal obligations, and any signed order form.'],
  ['FERPA and school customers', 'Schools and districts may require a separately signed student-data or FERPA addendum. This standard addendum does not override a signed school-specific agreement.'],
]

export default function DataProcessingAddendumPage() {
  return <main className="page-shell public-page"><div className="relative z-10 mx-auto max-w-4xl px-6 py-16">
    <p className="public-kicker">Legal</p><h1 className="public-title mt-2 text-4xl md:text-5xl">Data Processing Addendum</h1>
    <p className="mt-3 text-xs text-[#4a4a4a]">Version {ORGANIZATION_AGREEMENT_VERSION} · Effective {ORGANIZATION_AGREEMENT_EFFECTIVE_DATE}</p>
    <p className="public-copy mt-4">This addendum applies when Coaches Hive processes personal data for an organization using the platform.</p>
    <div className="mt-8 space-y-5 text-sm leading-6 text-[#4a4a4a]">{items.map(([title, body], i) => <section key={title} className="glass-card rounded-2xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">{i + 1}. {title}</h2><p className="mt-2">{body}</p></section>)}</div>
  </div></main>
}


import Link from 'next/link'
import AdminSidebar from '@/components/AdminSidebar'

const groups = [
  { title: 'People and organizations', links: [['Users and roles','/admin/users'],['Organizations','/admin/orgs'],['Coaches','/admin/coaches'],['Athletes','/admin/athletes'],['Memberships','/admin/memberships'],['Workspaces','/admin/workspaces'],['Verifications','/admin/verifications']] },
  { title: 'Programs and commerce', links: [['Programs','/admin/programs'],['Tryouts','/admin/tryouts'],['Orders','/admin/orders'],['Reviews','/admin/reviews'],['Waivers','/admin/waivers']] },
  { title: 'Payments and subscriptions', links: [['Payment accounting','/admin/payment-accounting'],['Subscriptions','/admin/subscriptions'],['Billing failures','/admin/billing-failures'],['Refunds','/admin/refunds'],['Disputes','/admin/disputes'],['Payouts','/admin/payouts'],['Connect accounts','/admin/connect-accounts'],['Stripe reconciliation','/admin/stripe-reconciliation']] },
  { title: 'Operations and health', links: [['Support','/admin/support'],['System health','/admin/system-health'],['Webhook health','/admin/webhooks'],['Push health','/admin/push-health'],['Apple IAP logs','/admin/apple-notifications'],['Mobile handoffs','/admin/mobile-handoffs'],['Uptime','/admin/uptime'],['Workspace reconciliation','/admin/workspace-reconciliation']] },
  { title: 'Governance and data', links: [['Insights','/admin/insights'],['Audit log','/admin/audit'],['Organization activity','/admin/org-audit'],['Exports','/admin/exports'],['Automations','/admin/automations'],['Data retention','/admin/retention'],['Playbook','/admin/playbook'],['Debug','/admin/debug']] },
]

export default function AdminControlCenterPage() {
  return <main className="page-shell"><div className="relative z-10 px-6 py-10"><div className="grid items-start gap-6 lg:grid-cols-[200px_minmax(0,1fr)]"><AdminSidebar/><div className="min-w-0 space-y-6"><header><p className="text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">Superadmin</p><h1 className="text-3xl font-bold">Control Center</h1><p className="mt-2 text-sm text-neutral-600">Every detailed administrative workflow, grouped beneath the five permanent navigation tabs.</p></header><div className="grid gap-4 md:grid-cols-2">{groups.map(group=><section key={group.title} className="rounded-3xl border border-[#191919] bg-white p-5"><h2 className="font-semibold text-[#191919]">{group.title}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{group.links.map(([label,href])=><Link key={href} href={href} className="rounded-2xl border border-[#dcdcdc] px-3 py-2 text-sm font-semibold hover:border-[#191919]">{label}</Link>)}</div></section>)}</div></div></div></div></main>
}

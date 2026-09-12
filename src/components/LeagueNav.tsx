'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links=[['Overview','/league'],['Clubs','/league/clubs'],['Divisions','/league/divisions'],['Teams','/league/teams'],['Schedule & results','/league/schedule'],['Registrations','/league/registrations'],['Payments & balances','/league/payments'],['Documents','/league/documents'],['Compliance','/league/submissions'],['Announcements','/league/announcements'],['Staff & permissions','/league/staff'],['Seasons','/league/seasons'],['Audit history','/league/audit']] as const
export default function LeagueNav(){const path=usePathname();return <nav aria-label="League navigation" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{links.map(([label,href])=><Link key={href} href={href} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${path===href?'bg-[#191919] text-white':'border border-[#dcdcdc] bg-white text-[#191919]'}`}>{label}</Link>)}</nav>}

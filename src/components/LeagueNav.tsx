'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePortalCapabilities } from '@/lib/usePortalCapabilities'

const links=[['Overview','/league','dashboard'],['Clubs','/league/clubs','clubs'],['Divisions','/league/divisions','divisions'],['Teams','/league/teams','teams'],['Schedule & results','/league/schedule','calendar'],['Registrations','/league/registrations','registrations'],['Payments & balances','/league/payments','payments'],['Documents','/league/documents','documents'],['Compliance','/league/submissions','compliance'],['Announcements','/league/announcements','announcements'],['Staff & permissions','/league/staff','permissions'],['Seasons','/league/seasons','seasons'],['Audit history','/league/audit','audit']] as const
export default function LeagueNav(){const path=usePathname();const{canView}=usePortalCapabilities();return <nav aria-label="League navigation" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{links.filter(([, ,capability])=>canView(capability)).map(([label,href])=><Link key={href} href={href} className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${path===href?'bg-[#191919] text-white':'border border-[#dcdcdc] bg-white text-[#191919]'}`}>{label}</Link>)}</nav>}

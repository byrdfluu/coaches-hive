'use client'

import Link from 'next/link'

export default function PortalRoleSwitcher({ currentPortal: _currentPortal }: { currentPortal: 'coach' | 'org' }) {
  return <div className="rounded-2xl border border-[#dcdcdc] bg-[#f7f6f4] px-3 py-3 text-xs text-[#191919]"><p className="text-[10px] uppercase tracking-[0.3em] text-[#4a4a4a]">Profile & workspace</p><Link href="/workspace" className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-full border border-[#191919] bg-white px-3 py-2 font-semibold transition hover:bg-[#191919] hover:text-white">Switch profile or workspace</Link></div>
}

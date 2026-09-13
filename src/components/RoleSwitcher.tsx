'use client'

import Link from 'next/link'

export default function RoleSwitcher({ hideOrgOptions: _hideOrgOptions = false }: { hideOrgOptions?: boolean }) {
  return <Link href="/workspace" className="inline-flex min-h-10 items-center rounded-full border border-[#191919] bg-white px-4 py-2 text-xs font-semibold text-[#191919] transition hover:bg-[#191919] hover:text-white">Switch profile or workspace</Link>
}

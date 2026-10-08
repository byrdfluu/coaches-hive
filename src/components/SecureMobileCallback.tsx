'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type CallbackKind = 'account' | 'invitation' | 'confirmation'

const ALLOWED_QUERY_KEYS = new Set(['code', 'type', 'state', 'next'])

const copyByKind: Record<CallbackKind, { eyebrow: string; title: string; body: string }> = {
  account: {
    eyebrow: 'Secure account action',
    title: 'Continue securely in Coaches Hive',
    body: 'Open Coaches Hive to finish this account action. If the app is unavailable, you can continue in this browser.',
  },
  invitation: {
    eyebrow: 'Secure invitation',
    title: 'Accept your Coaches Hive invitation',
    body: 'Open Coaches Hive to accept this invitation. If the app is unavailable, you can continue in this browser.',
  },
  confirmation: {
    eyebrow: 'Secure confirmation',
    title: 'Confirm your Coaches Hive account',
    body: 'Open Coaches Hive to finish confirmation. If the app is unavailable, you can continue in this browser.',
  },
}

export default function SecureMobileCallback({ kind = 'account' }: { kind?: CallbackKind }) {
  const [links, setLinks] = useState({ open: '', web: '', valid: false, ready: false })
  useEffect(() => {
    const source = new URL(window.location.href)
    const safe = new URLSearchParams()
    source.searchParams.forEach((value, key) => {
      if (ALLOWED_QUERY_KEYS.has(key)) safe.set(key, value)
    })
    const suffix = safe.toString()
    const openHost = source.hostname === 'app.coacheshive.com' ? 'https://coacheshive.com' : 'https://app.coacheshive.com'
    const open = new URL(source.pathname, openHost)
    open.search = suffix
    const web = new URL('/auth/callback', source.origin)
    web.search = suffix
    setLinks({ open: open.toString(), web: web.toString(), valid: Boolean(safe.get('code')), ready: true })
  }, [])
  const copy = copyByKind[kind]

  return (
    <main className="flex min-h-[72vh] items-center justify-center bg-[#e8e8e8] px-5 py-16">
      <section className="w-full max-w-2xl rounded-[32px] border border-black/10 bg-white px-6 py-12 text-center shadow-[0_24px_70px_rgba(25,25,25,0.12)] sm:px-12">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#b80f0a]">{copy.eyebrow}</p>
        <h1 className="mt-4 text-4xl leading-tight text-[#191919] sm:text-5xl">{copy.title}</h1>
        <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-[#4a4a4a] sm:text-lg">
          {!links.ready ? 'Checking this secure link…' : links.valid ? copy.body : 'This link is invalid or has expired. Request a new secure link to continue.'}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {links.ready && links.valid ? (
            <>
              <a href={links.open} rel="noreferrer" className="rounded-full bg-[#b80f0a] px-6 py-3 font-bold text-white">Open Coaches Hive</a>
              <a href={links.web} rel="noreferrer" className="rounded-full border border-[#191919] px-6 py-3 font-bold text-[#191919]">Continue on the web</a>
            </>
          ) : null}
          <Link href="/auth/forgot-password" className="rounded-full border border-[#191919] px-6 py-3 font-bold text-[#191919]">Request a new link</Link>
        </div>
      </section>
    </main>
  )
}

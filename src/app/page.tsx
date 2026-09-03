'use client'

import Link from 'next/link'
import Image from 'next/image'
import GetTheAppButton from '@/components/GetTheAppButton'
import SportsTicker from '@/components/SportsTicker'

const audiences = [
  { id: 'organizations', eyebrow: 'Organizations', title: 'See the whole operation.', description: 'See teams, coaches, schedules, registrations, payments, and compliance across your entire program.', features: ['Organization-wide visibility', 'Payments and reporting', 'Documents and compliance'] },
  { id: 'coaches', eyebrow: 'Coaches', title: 'Run the team from one place.', description: 'Manage the daily work without bouncing between calendars, spreadsheets, group chats, and payment tools.', features: ['Scheduling and attendance', 'Athletes and rosters', 'Team communication'] },
  { id: 'athletes', eyebrow: 'Athletes and families', title: 'Know exactly where to go.', description: 'Find schedules, messages, forms, balances, and registration details without searching through different apps.', features: ['Schedules and messages', 'Waivers and documents', 'Registrations and payments'] },
]
const features = [
  ['One calendar', 'Replace scattered schedule threads with one calendar for practices, games, programs, and attendance.'],
  ['One inbox', 'Replace disconnected group chats with messages and updates tied to the right teams and people.'],
  ['One payment center', 'Replace checks, payment apps, and tracking sheets with registrations, dues, reminders, and receipts.'],
  ['One roster', 'Replace copies passed between coaches with connected athlete and team records.'],
  ['One place for waivers', 'Create, assign, sign, and retain the documents your program needs.'],
  ['One organization view', 'See activity, access, payments, schedules, and compliance across every team.'],
]

const fragmentation = [
  ['Schedules', 'buried in text threads'],
  ['Payments', 'spread across checks and payment apps'],
  ['Rosters', 'living in different spreadsheets'],
  ['Waivers', 'scattered across paper forms and inboxes'],
  ['Team updates', 'sent through disconnected group chats'],
  ['Organization details', 'with no single place to see the full picture'],
]

export default function Home() {
  return <main className="page-shell public-page">
    <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <section className="glass-card card-hero card-accent relative mt-8 overflow-hidden bg-white p-5 sm:mt-12 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -left-24 top-10 h-56 w-56 rounded-full bg-[#b80f0a]/10 blur-[120px]" />
        <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-10">
          <div className="animate-rise min-w-0 space-y-6"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">Youth sports, connected</p><h1 className="display break-words text-[2.45rem] font-semibold leading-[1.04] text-[#1f1c18] sm:text-[3.7rem]" data-testid="hero-title">Coach more.<br />Coordinate less.</h1><p className="max-w-xl text-lg leading-relaxed text-[#666] sm:text-xl">Bring schedules, communication, rosters, registrations, payments, documents and waivers together in one connected platform.</p><div className="flex flex-wrap gap-3"><Link href="/signup" className="inline-flex items-center rounded-full bg-[#b80f0a] px-5 py-2.5 text-sm font-semibold text-white">Start your free trial</Link><Link href="#how-it-works" className="inline-flex items-center rounded-full border border-[#191919] bg-white px-5 py-2.5 text-sm font-semibold text-[#191919]">See how it works</Link></div><div className="flex flex-wrap gap-2">{['AAU','Travel sports','Club sports','Youth leagues','School athletics'].map(label => <span key={label} className="rounded-full border bg-[#f7f7f7] px-3 py-1 text-xs font-semibold text-[#555]">{label}</span>)}</div></div>
          <div className="flex min-w-0 justify-center overflow-visible">
            <Image src="/home/coaches-hive-hero-v2.png" alt="Texts, spreadsheets, payment apps, calendars, and documents connected through the Coaches Hive organization dashboard" width={1460} height={1400} priority sizes="(max-width: 1023px) 100vw, 52vw" className="h-auto w-[108%] max-w-[756px] shrink-0 drop-shadow-[0_24px_45px_rgba(25,25,25,0.10)]" />
          </div>
        </div><SportsTicker />
      </section>

      <section className="pt-24">
        <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-stretch">
          <div className="flex flex-col"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">The real problem</p><h2 className="display mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Your program works hard.<br />Managing it should feel easier.</h2><p className="mt-5 max-w-xl text-base leading-relaxed text-[#666] sm:text-lg">The problem isn&apos;t how you chose to run your program. Youth sports has been forced across tools that were never designed to work together.</p><div className="mt-7 rounded-3xl bg-[#191919] px-6 py-7 text-white sm:px-8"><p className="text-lg font-semibold leading-relaxed sm:text-xl">Coaches Hive brings those moving pieces into one connected system without changing what makes your program work.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">{fragmentation.map(([title,description])=><article key={title} className="rounded-2xl border border-[#d8d8d8] bg-white p-5"><p className="text-sm font-semibold text-[#191919]">{title}</p><p className="mt-1 text-sm leading-relaxed text-[#666]">{description}</p></article>)}</div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-28 pt-24">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">How it works</p>
        <h2 className="display mt-3 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl">Bring the daily work together.<br />Keep the whole program connected.</h2>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[#666] sm:text-lg">Give coaches one place to run the team, families one clear destination, and organizations visibility across it all.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            ['1', 'Bring the daily work together.', 'Schedules, rosters, attendance, notes, registrations, and payments live in one place.', '/screenshots/app/app home.png', 'Coach home dashboard'],
            ['2', 'Give every family one clear destination.', 'Parents see the right schedule, messages, forms, balances, and receipts without searching through different apps.', '/screenshots/app/app schedule.PNG', 'Shared schedule screen'],
            ['3', 'See the entire organization.', 'Directors get visibility across every team, coach, payment, registration, and compliance requirement.', '/screenshots/app/org dashboard.jpg', 'Organization dashboard'],
          ].map(([number, title, description, image, alt]) => (
            <article key={number} className="flex min-h-[38rem] flex-col overflow-hidden rounded-[2rem] border border-[#d8d8d8] bg-white shadow-sm">
              <div className="p-7">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8d8d8] text-sm font-bold text-[#777]">{number}</span>
                <h3 className="mt-7 text-2xl font-semibold leading-tight text-[#191919]">{title}</h3>
                <p className="mt-3 text-base leading-relaxed text-[#666]">{description}</p>
              </div>
              <img src={image} alt={alt} className="mx-auto mt-auto h-80 w-[82%] rounded-t-[2rem] border border-b-0 border-[#d8d8d8] object-cover object-top shadow-lg" />
            </article>
          ))}
        </div>
      </section>

      <section className="mt-24"><div className="text-center"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">One connected system</p><h2 className="display mt-3 text-4xl font-semibold">Replace the patchwork. Keep the whole program connected.</h2></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(([title,description]) => <article key={title} className="rounded-3xl border border-[#d8d8d8] bg-white p-6"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-[#666]">{description}</p></article>)}</div></section>

      <section className="mt-24 text-center"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">Built for the whole organization</p><h2 className="display mt-3 text-4xl font-semibold">One organization. Three connected experiences.</h2><p className="mx-auto mt-3 max-w-2xl text-[#666]">Organizations, coaches, and families get the tools they need while the important details stay connected.</p></section>
      <section className="mt-10 grid gap-5 lg:grid-cols-3">{audiences.map((item, index) => <article id={item.id} key={item.id} className="scroll-mt-28 rounded-[2rem] border border-[#191919] bg-white p-6 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#191919] text-xs font-bold text-white">0{index+1}</span><p className="mt-6 text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">{item.eyebrow}</p><h3 className="mt-2 text-2xl font-semibold">{item.title}</h3><p className="mt-3 min-h-24 text-sm leading-relaxed text-[#666]">{item.description}</p><ul className="mt-5 space-y-2 border-t pt-5 text-sm font-semibold">{item.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul></article>)}</section>


      <section className="my-24 rounded-[2rem] border border-[#191919] bg-white p-8 text-center sm:p-12"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">Bring it all together</p><h2 className="display mt-3 text-4xl font-semibold">Give your entire program one place to go.</h2><p className="mx-auto mt-3 max-w-2xl text-[#666]">Start with your team today. Bring schedules, communication, payments, registrations, and paperwork together as your program grows.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><Link href="/signup" className="inline-flex items-center rounded-full bg-[#b80f0a] px-6 py-3 text-sm font-semibold text-white">Start your free trial</Link><Link href="/pricing" className="inline-flex items-center rounded-full border border-[#191919] px-6 py-3 text-sm font-semibold text-[#191919]">View pricing</Link></div><div className="mt-5 flex justify-center"><GetTheAppButton /></div></section>
    </div>
  </main>
}

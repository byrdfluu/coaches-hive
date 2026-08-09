'use client'

import Link from 'next/link'
import GetTheAppButton from '@/components/GetTheAppButton'
import HeroPhoneMockups from '@/components/HeroPhoneMockups'
import SportsTicker from '@/components/SportsTicker'

const audiences = [
  { id: 'organizations', eyebrow: 'Organizations', title: 'Run the whole operation.', description: 'Manage teams, coaches, registrations, payments, communication, compliance, and reporting from one workspace.', features: ['Teams and rosters', 'Programs and payments', 'Documents and reporting'] },
  { id: 'coaches', eyebrow: 'Coaches', title: 'Managing the daily operations.', description: 'Manage schedules, attendance, athletes, communication, and daily team operations in one place.', features: ['Scheduling and attendance', 'Athlete management', 'Team communication'] },
  { id: 'athletes', eyebrow: 'Athletes and families', title: 'Keep every detail together.', description: 'Stay current on team schedules, complete documents, receive updates, and track registrations and payments in the app.', features: ['Team schedules and messages', 'Waivers and documents', 'Registrations and payments'] },
]
const features = [
  ['Scheduling & attendance', 'Coordinate sessions, camps, programs, calendars, and attendance.'],
  ['Messages & notifications', 'Keep updates connected to the people, teams, and sessions they affect.'],
  ['Payments & registrations', 'Collect dues, registrations, bookings, and marketplace payments securely.'],
  ['Documents & waivers', 'Create, assign, sign, and retain important youth-sports documentation.'],
  ['Discovery & marketplace', 'Help athletes find coaching and let sellers reach the sports community.'],
  ['Reporting & controls', 'Give organizations visibility into activity, access, payments, and compliance.'],
]

export default function Home() {
  return <main className="page-shell public-page">
    <div className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <section className="glass-card card-hero card-accent relative mt-8 overflow-hidden bg-white p-5 sm:mt-12 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -left-24 top-10 h-56 w-56 rounded-full bg-[#b80f0a]/10 blur-[120px]" />
        <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-10">
          <div className="animate-rise min-w-0 space-y-6"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">One connected sports platform</p><h1 className="display break-words text-[2.8rem] font-semibold leading-[1.02] text-[#1f1c18] sm:text-[4.4rem]" data-testid="hero-title">Youth sports is complex enough. Running it shouldn&apos;t be.</h1><p className="max-w-xl text-lg leading-relaxed text-[#666] sm:text-xl">Coaches Hive gives programs, coaches, and athletes one place for scheduling, payments, rosters, communication, and tryouts.</p><div className="flex flex-wrap gap-3"><GetTheAppButton className="!border-[#191919]" /><Link href="/pricing" className="inline-flex items-center rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white">View pricing</Link></div><div className="flex flex-wrap gap-2">{['AAU','Travel sports','Club sports','Youth leagues'].map(label => <span key={label} className="rounded-full border bg-[#f7f7f7] px-3 py-1 text-xs font-semibold text-[#555]">{label}</span>)}</div></div>
          <div className="flex min-w-0 justify-center overflow-hidden lg:overflow-visible"><HeroPhoneMockups /></div>
        </div><SportsTicker />
      </section>

      <section id="how-it-works" className="scroll-mt-28 pt-24">
        <p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">How it works</p>
        <h2 className="display mt-3 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl">Coaches run the day-to-day.<br />Coaches Hive connects the whole program.</h2>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-[#666] sm:text-lg">Give coaches one place to manage their work while keeping athletes, families, and organizations in sync.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            ['1', 'Your entire coaching day.', 'Schedules, athletes, attendance, notes, programs, and payments managed in one place.', '/screenshots/app/app home.png', 'Coach home dashboard'],
            ['2', 'Everyone stays in sync.', 'Schedule changes, messages, reminders, and important updates reach the right people.', '/screenshots/app/app schedule.PNG', 'Shared schedule screen'],
            ['3', 'Visibility across the whole organization.', 'Organizations get visibility across teams, schedules, payments, and compliance without slowing operations down.', '/screenshots/app/org dashboard.jpg', 'Organization dashboard'],
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

      <section className="mt-24"><div className="text-center"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">Platform suite</p><h2 className="display mt-3 text-4xl font-semibold">Everything needed to run youth sports.</h2></div><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map(([title,description]) => <article key={title} className="rounded-3xl border border-[#d8d8d8] bg-white p-6"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-[#666]">{description}</p></article>)}</div></section>

      <section className="mt-24 text-center"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">Built for the whole organization</p><h2 className="display mt-3 text-4xl font-semibold">One organization. Three connected experiences.</h2><p className="mx-auto mt-3 max-w-2xl text-[#666]">Organizations, coaches, and families get the tools they need while the important details stay connected.</p></section>
      <section className="mt-10 grid gap-5 lg:grid-cols-3">{audiences.map((item, index) => <article id={item.id} key={item.id} className="scroll-mt-28 rounded-[2rem] border border-[#191919] bg-white p-6 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#191919] text-xs font-bold text-white">0{index+1}</span><p className="mt-6 text-xs font-bold uppercase tracking-[.24em] text-[#b80f0a]">{item.eyebrow}</p><h3 className="mt-2 text-2xl font-semibold">{item.title}</h3><p className="mt-3 min-h-24 text-sm leading-relaxed text-[#666]">{item.description}</p><ul className="mt-5 space-y-2 border-t pt-5 text-sm font-semibold">{item.features.map(feature => <li key={feature}>✓ {feature}</li>)}</ul></article>)}</section>


      <section className="my-24 rounded-[2rem] border border-[#191919] bg-white p-8 text-center sm:p-12"><p className="text-xs font-bold uppercase tracking-[.3em] text-[#b80f0a]">Coaches Hive mobile</p><h2 className="display mt-3 text-4xl font-semibold">Ready to bring it all together?</h2><p className="mx-auto mt-3 max-w-xl text-[#666]">Download Coaches Hive and run your sports experience from one connected app.</p><div className="mt-7 flex justify-center"><GetTheAppButton className="!bg-[#b80f0a] !px-6 !py-3 !text-white" /></div><p className="mt-5 text-sm text-[#666]">Coach independently? <Link href="/pricing?audience=coaches" className="font-semibold text-[#191919] underline underline-offset-4">Explore Coach All Access.</Link></p></section>
    </div>
  </main>
}

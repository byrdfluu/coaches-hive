'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type Step = {
  icon: string
  title: string
  body: string
  actionLabel?: string
  actionHref?: string
}

const stepsByRole = {
  coach: [
    {
      icon: '🎉',
      title: 'Welcome to your Coach Portal',
      body: 'Set up your profile, open your calendar, and get ready to take bookings and sell through Marketplace.',
    },
    {
      icon: '👤',
      title: 'Complete your coach profile',
      body: 'Add your photo, specialties, and coaching details so athletes know why to book with you.',
      actionLabel: 'Set up profile →',
      actionHref: '/coach/settings',
    },
    {
      icon: '✅',
      title: 'Submit verification',
      body: 'Send in your verification materials to earn your verified badge and build trust with athletes viewing your profile.',
      actionLabel: 'Submit verification →',
      actionHref: '/coach/settings#verification',
    },
    {
      icon: '📅',
      title: 'Open your availability',
      body: 'Add time slots in Calendar so athletes can request and book sessions with you.',
      actionLabel: 'Open calendar →',
      actionHref: '/coach/calendar',
    },
    {
      icon: '💳',
      title: 'Connect payouts',
      body: 'Finish Stripe setup so you can get paid when athletes book with you or purchase your products.',
      actionLabel: 'Connect Stripe →',
      actionHref: '/coach/stripe-setup',
    },
    {
      icon: '💼',
      title: 'Run your coaching business',
      body: 'Manage bookings, message athletes, and launch products in Marketplace from one place.',
      actionLabel: 'View checklist →',
      actionHref: '/coach/onboarding',
    },
  ] satisfies Step[],
  athlete: [
    {
      icon: '🎉',
      title: 'Welcome to your Athlete Portal',
      body: 'Find the right coach, book sessions, and keep your training in one place.',
    },
    {
      icon: '👤',
      title: 'Complete your athlete profile',
      body: 'Add your photo, sport, age group, and goals so coaches can personalize your training.',
      actionLabel: 'Set up profile →',
      actionHref: '/athlete/settings',
    },
    {
      icon: '🔍',
      title: 'Find the right coach',
      body: 'Use Discover to compare coaches, specialties, reviews, and availability.',
      actionLabel: 'Discover coaches →',
      actionHref: '/athlete/discover',
    },
    {
      icon: '📅',
      title: 'Book your first session',
      body: 'Choose a time, pay securely, and lock in your next training session.',
      actionLabel: 'Book a session →',
      actionHref: '/athlete/calendar',
    },
    {
      icon: '💬',
      title: 'Stay connected and organized',
      body: 'Use Messages, Notes, and session history to keep feedback, plans, and progress together.',
      actionLabel: 'Go to dashboard →',
      actionHref: '/athlete/dashboard',
    },
    {
      icon: '🛍️',
      title: 'Use Marketplace when you need more support',
      body: 'Buy training plans, digital products, and add-ons from coaches you trust.',
      actionLabel: 'Open Marketplace →',
      actionHref: '/athlete/marketplace',
    },
  ] satisfies Step[],
  org: [
    {
      icon: '🎉',
      title: 'Welcome to your Org Portal',
      body: 'Manage teams, coaches, and reporting across the organization.',
    },
    {
      icon: '🎨',
      title: 'Complete org branding',
      body: 'Upload your logo, cover image, and colors to unify every team page.',
      actionLabel: 'Org settings →',
      actionHref: '/org/settings',
    },
    {
      icon: '🔒',
      title: 'Set policies & permissions',
      body: 'Define booking rules, communication limits, and staff roles.',
      actionLabel: 'Set permissions →',
      actionHref: '/org/permissions',
    },
    {
      icon: '📈',
      title: 'Monitor activity',
      body: 'Review rosters, sessions, and revenue in your org dashboard. Connect Stripe to start receiving payments.',
      actionLabel: 'View checklist →',
      actionHref: '/org/onboarding',
    },
  ] satisfies Step[],
  guardian: [
    {
      icon: '🎉',
      title: 'Welcome to your Guardian Portal',
      body: 'Review and approve activity for your linked athletes — all from one place.',
    },
    {
      icon: '👥',
      title: 'Your linked athletes',
      body: 'See every athlete connected to your account, their status, and any pending approvals waiting on you.',
      actionLabel: 'View dashboard →',
      actionHref: '/guardian/dashboard',
    },
    {
      icon: '✅',
      title: 'Approvals',
      body: 'Approve or deny requests for messages, transactions, and other activity on behalf of your athlete.',
      actionLabel: 'Review approvals →',
      actionHref: '/guardian/approvals',
    },
  ] satisfies Step[],
}

type Role = keyof typeof stepsByRole

type OnboardingModalProps = {
  role: Role
  open: boolean
  onClose: () => void
  userName?: string
}

export default function OnboardingModal({ role, open, onClose, userName }: OnboardingModalProps) {
  const steps = useMemo(() => stepsByRole[role], [role])
  const [index, setIndex] = useState(0)

  if (!open) return null

  const isFirst = index === 0
  const isLast = index === steps.length - 1
  const step = steps[index]

  const displayTitle = isFirst && userName
    ? `Welcome, ${userName.split(' ')[0]}`
    : step.title

  const handleNext = () => {
    if (isLast) {
      onClose()
      return
    }
    setIndex((prev) => Math.min(prev + 1, steps.length - 1))
  }

  const handlePrev = () => {
    if (isFirst) return
    setIndex((prev) => Math.max(prev - 1, 0))
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/40 px-3 py-3 sm:items-center sm:px-4">
      <div className="w-full max-w-lg max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-[28px] border border-[#191919] bg-white p-5 shadow-xl sm:max-h-[85vh] sm:rounded-3xl sm:p-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f5f5f5] text-xl">
              {step.icon}
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[#4a4a4a]">Onboarding</p>
              <h2 className="mt-0.5 text-xl font-semibold text-[#191919]">{displayTitle}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-1 shrink-0 text-xs font-semibold text-[#4a4a4a] underline hover:text-[#191919]"
          >
            Skip
          </button>
        </div>

        {/* Body */}
        <p className="mt-4 text-sm text-[#4a4a4a]">{step.body}</p>

        {/* Footer */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`block h-2 rounded-full transition-all duration-200 ${
                  i === index ? 'w-5 bg-[#191919]' : 'w-2 bg-[#dcdcdc]'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {step.actionHref && (
              <Link
                href={step.actionHref}
                onClick={onClose}
                className="rounded-full border border-[#191919] px-3 py-2 text-center text-xs font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-[#b80f0a]"
              >
                {step.actionLabel}
              </Link>
            )}
            <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:items-center">
              <button
                onClick={handlePrev}
                disabled={isFirst}
                className="rounded-full border border-[#191919] px-3 py-2 text-sm font-semibold text-[#191919] transition-opacity disabled:opacity-30"
              >
                ←
              </button>
              <button
                onClick={handleNext}
                className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors ${
                  isLast ? 'bg-green-600 hover:bg-green-700' : 'bg-[#b80f0a] hover:opacity-90'
                }`}
              >
                {isLast ? 'Get started →' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

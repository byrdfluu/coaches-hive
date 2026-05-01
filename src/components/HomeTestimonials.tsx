'use client'

import { useEffect, useState } from 'react'

const testimonials = [
  {
    quote:
      'I was using 4 different apps to manage my clients. Scheduling, payments, messaging—it was a mess. Coaches Hive put everything in one place and saved me hours every week.',
    name: 'James Carter',
    role: 'Basketball Trainer',
  },
  {
    quote:
      'The biggest win for me is getting paid automatically. No more chasing Venmo or reminding parents. That alone made it worth it.',
    name: 'Marcus Lee',
    role: 'Soccer Coach',
  },
  {
    quote:
      "I didn't realize how much time I was wasting until I switched. Now everything runs through one system and I can actually focus on coaching again.",
    name: 'Tyler Brooks',
    role: 'Strength & Conditioning Coach',
  },
  {
    quote:
      "Before Coaches Hive, I was texting my coach, sending payments separately, and trying to keep track of everything myself. Now it's all in one place and way easier to stay consistent.",
    name: 'Alex Rivera',
    role: 'Adult Fitness Athlete',
  },
  {
    quote:
      "Managing my kid's training used to mean juggling texts, schedules, and payments. Coaches Hive made everything simple. I always know what's coming up and nothing gets missed.",
    name: 'Sarah Mitchell',
    role: 'Parent (Youth Soccer)',
  },
  {
    quote:
      'I love that I can book sessions and pay in the same place. It just feels organized. As a parent, that peace of mind goes a long way.',
    name: 'David Thompson',
    role: 'Parent (Youth Basketball)',
  },
]

const groups = [testimonials.slice(0, 3), testimonials.slice(3, 6)]

export default function HomeTestimonials() {
  const [active, setActive] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setActive((prev) => (prev + 1) % groups.length)
        setVisible(true)
      }, 400)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="mt-16">
      <div className="mb-8 text-center">
        <p className="public-kicker">What coaches and athletes say</p>
        <h2 className="mt-2 text-3xl font-semibold text-[#1f1c18]">Real results from real people.</h2>
      </div>

      <div
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 400ms ease',
        }}
      >
        {groups[active].map((t) => (
          <div
            key={t.name}
            className="glass-card flex flex-col gap-4 border border-[#191919] bg-white p-6"
          >
            <p className="flex-1 text-sm leading-relaxed text-[#4a4a4a]">
              &ldquo;{t.quote}&rdquo;
            </p>
            <div>
              <p className="text-sm font-semibold text-[#1f1c18]">— {t.name}</p>
              <p className="text-xs text-[#4a4a4a]">{t.role}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {groups.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to testimonial group ${i + 1}`}
            onClick={() => {
              setVisible(false)
              setTimeout(() => {
                setActive(i)
                setVisible(true)
              }, 400)
            }}
            className={`h-2 rounded-full transition-all duration-300 ${
              active === i ? 'w-6 bg-[#b80f0a]' : 'w-2 bg-[#d1d5db]'
            }`}
          />
        ))}
      </div>
    </section>
  )
}

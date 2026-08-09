'use client'

import React from 'react'

// Screenshots expected at /public/screenshots/app/
// home.png    → the Home screen (Jordan Parker, stats, Quick Actions)
// schedule.png → Schedule calendar screen
// waivers.png  → Waivers screen

type PhoneProps = {
  src: string
  alt: string
}

function Phone({ src, alt }: PhoneProps) {
  return (
    <div
      className="relative flex-shrink-0 select-none"
      style={{ width: 196, height: 408 }}
    >
      {/* Body */}
      <div
        className="absolute inset-0 rounded-[42px] bg-[#1c1c1e]"
        style={{
          boxShadow:
            '0 24px 64px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        {/* Side buttons */}
        <div className="absolute -left-[3px] top-[72px] h-6 w-[3px] rounded-l-full bg-[#2a2a2a]" />
        <div className="absolute -left-[3px] top-[108px] h-10 w-[3px] rounded-l-full bg-[#2a2a2a]" />
        <div className="absolute -left-[3px] top-[158px] h-10 w-[3px] rounded-l-full bg-[#2a2a2a]" />
        <div className="absolute -right-[3px] top-[106px] h-14 w-[3px] rounded-r-full bg-[#2a2a2a]" />

        {/* Screen */}
        <div className="absolute inset-[5px] overflow-hidden rounded-[37px] bg-[#f2f2f7]">
          {/* Dynamic island */}
          <div className="absolute left-1/2 top-[8px] z-10 h-[14px] w-[52px] -translate-x-1/2 rounded-full bg-black" />

          <img
            src={src}
            alt={alt}
            className="h-full w-full object-cover object-top"
            draggable={false}
          />

          {/* Subtle screen border */}
          <div className="pointer-events-none absolute inset-0 rounded-[37px] ring-1 ring-black/[0.07]" />
        </div>
      </div>
    </div>
  )
}

export default function HeroPhoneMockups() {
  return (
    <div className="relative h-[275px] w-full min-w-0 overflow-visible min-[360px]:h-[320px] min-[400px]:h-[360px] sm:h-[440px] sm:max-w-[400px]" aria-hidden="true">
      <div className="absolute left-1/2 top-6 h-[440px] w-[400px] origin-top -translate-x-1/2 scale-[0.62] min-[360px]:scale-[0.72] min-[400px]:scale-[0.8] sm:top-0 sm:scale-100">
        {/* Left phone — roster */}
        <div
          className="absolute left-1/2"
          style={{
            transform: 'translateX(-208px) translateY(-12px) rotate(-4deg) scale(0.82)',
            transformOrigin: 'bottom center',
            zIndex: 1,
            filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.18))',
          }}
        >
          <Phone src="/screenshots/app/app roster.PNG" alt="Roster screen" />
        </div>

        {/* Center phone — home (front) */}
        <div
          className="absolute left-1/2"
          style={{
            transform: 'translateX(-98px) translateY(-24px) scale(1)',
            transformOrigin: 'bottom center',
            zIndex: 10,
            filter: 'drop-shadow(0 24px 56px rgba(0,0,0,0.22))',
          }}
        >
          <Phone src="/screenshots/app/app home.png" alt="Home screen" />
        </div>

        {/* Right phone — schedule */}
        <div
          className="absolute left-1/2"
          style={{
            transform: 'translateX(12px) translateY(-12px) rotate(4deg) scale(0.82)',
            transformOrigin: 'bottom center',
            zIndex: 1,
            filter: 'drop-shadow(0 16px 40px rgba(0,0,0,0.18))',
          }}
        >
          <Phone src="/screenshots/app/app schedule.PNG" alt="Schedule screen" />
        </div>
      </div>
    </div>
  )
}

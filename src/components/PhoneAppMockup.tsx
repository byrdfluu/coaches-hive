'use client'

// Plays the sports video clips inside the phone screen.
// When real mobile app screenshots are ready, replace the <video> block
// with cycling <img> tags — the phone frame stays the same.

const VIDEO_CLIPS = ['/clip-2.mp4', '/clip-1.mp4', '/clip-3.mp4', '/clip-4.mp4']

export default function PhoneAppMockup({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: 210, height: 434 }}
      aria-hidden="true"
    >
      {/* Phone body */}
      <div
        className="absolute inset-0 rounded-[44px] bg-[#1a1a1a]"
        style={{
          boxShadow:
            '0 40px 100px rgba(0,0,0,0.7), 0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.09)',
        }}
      >
        {/* Volume buttons */}
        <div className="absolute -left-[3px] top-[76px] h-6 w-[3px] rounded-l-full bg-[#2e2e2e]" />
        <div className="absolute -left-[3px] top-[112px] h-10 w-[3px] rounded-l-full bg-[#2e2e2e]" />
        <div className="absolute -left-[3px] top-[162px] h-10 w-[3px] rounded-l-full bg-[#2e2e2e]" />
        {/* Power button */}
        <div className="absolute -right-[3px] top-[108px] h-14 w-[3px] rounded-r-full bg-[#2e2e2e]" />

        {/* Screen */}
        <div className="absolute inset-[5px] overflow-hidden rounded-[39px] bg-black">
          {/* Dynamic island */}
          <div className="absolute left-1/2 top-3 z-20 h-[24px] w-[88px] -translate-x-1/2 rounded-full bg-black" />

          {/* Sports video playing inside the phone */}
          <video
            src={VIDEO_CLIPS[0]}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover object-center"
          />

          {/* Subtle screen glare */}
          <div className="pointer-events-none absolute inset-0 rounded-[39px] ring-1 ring-white/[0.08]" />
        </div>
      </div>

      {/* Ground shadow */}
      <div className="pointer-events-none absolute -bottom-5 left-1/2 h-10 w-28 -translate-x-1/2 rounded-full bg-black/35 blur-2xl" />
    </div>
  )
}

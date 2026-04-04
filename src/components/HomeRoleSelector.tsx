'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type RoleOption = {
  label: string
  href: string
}

type HomeRoleSelectorProps = {
  options: RoleOption[]
}

export default function HomeRoleSelector({ options }: HomeRoleSelectorProps) {
  const router = useRouter()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const optionCount = Math.max(options.length, 1)

  const activeIndex = hoveredIndex ?? selectedIndex
  const highlightWidth = useMemo(() => `calc((100% - 0.5rem) / ${optionCount})`, [optionCount])

  const resolvePublicHref = (option: RoleOption) => {
    const normalized = option.label.toLowerCase()
    if (normalized.includes('coach')) return '/coach'
    if (normalized.includes('parent') || normalized.includes('athlete')) return '/athlete'
    if (normalized.includes('organization')) return '/organizations'
    return option.href
  }

  const handleSelect = (index: number) => {
    if (!options[index]) return
    setSelectedIndex(index)
    router.push(resolvePublicHref(options[index]))
  }

  return (
    <div className="relative mt-4 w-full max-w-[28rem] rounded-full border border-[#d7d7d7] bg-white p-1 shadow-[0_8px_24px_rgba(25,25,25,0.08)]">
      <span className="absolute -top-3 left-6 bg-white px-2 text-[11px] font-medium tracking-[0.08em] text-[#6b6b6b]">
        I am a:
      </span>
      <div>
        <div
          className="relative grid items-center rounded-full p-1"
          style={{ gridTemplateColumns: `repeat(${optionCount}, minmax(0, 1fr))` }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <span
            className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-full bg-[#b80f0a] transition-transform duration-250 ease-out"
            style={{
              width: highlightWidth,
              transform: `translateX(${activeIndex * 100}%)`,
            }}
          />
          {options.map((option, index) => (
            <button
              key={option.label}
              type="button"
              onMouseEnter={() => setHoveredIndex(index)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
              onClick={() => handleSelect(index)}
              className={`relative z-10 rounded-full px-3 py-2 text-sm font-semibold transition ${
                activeIndex === index ? 'text-white' : 'text-[#2b2b2b]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

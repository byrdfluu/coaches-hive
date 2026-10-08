'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type PillItem = {
  label: string
  href: string
}

export default function ScrollablePillNav({ items, label }: { items: PillItem[]; label: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    setCanScrollLeft(scroller.scrollLeft > 2)
    setCanScrollRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2)
  }, [])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    updateScrollState()
    const observer = new ResizeObserver(updateScrollState)
    observer.observe(scroller)
    window.addEventListener('resize', updateScrollState)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScrollState)
    }
  }, [items, updateScrollState])

  const scroll = (direction: -1 | 1) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollBy({ left: direction * Math.max(240, scroller.clientWidth * 0.7), behavior: 'smooth' })
  }

  return (
    <nav className="relative mt-7 flex min-w-0 items-center gap-2" aria-label={label}>
      <button
        type="button"
        onClick={() => scroll(-1)}
        disabled={!canScrollLeft}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dcdcdc] bg-white text-xl font-bold shadow-sm transition hover:border-[#191919] disabled:cursor-default disabled:opacity-25"
        aria-label="Scroll navigation left"
      >
        ‹
      </button>
      <div
        ref={scrollerRef}
        onScroll={updateScrollState}
        className="scrollbar-thin flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain pb-2"
      >
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#dcdcdc] bg-white px-5 py-2 text-center text-sm font-semibold leading-tight text-[#191919]"
          >
            {item.label}
          </a>
        ))}
      </div>
      <button
        type="button"
        onClick={() => scroll(1)}
        disabled={!canScrollRight}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dcdcdc] bg-white text-xl font-bold shadow-sm transition hover:border-[#191919] disabled:cursor-default disabled:opacity-25"
        aria-label="Scroll navigation right"
      >
        ›
      </button>
    </nav>
  )
}

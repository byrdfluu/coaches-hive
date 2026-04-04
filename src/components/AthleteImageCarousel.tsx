'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

type AthleteImageCarouselProps = {
  images: string[]
  className?: string
  intervalMs?: number
  imageClassName?: string
}

export default function AthleteImageCarousel({
  images,
  className,
  intervalMs = 2500,
  imageClassName,
}: AthleteImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (images.length < 2) {
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length)
    }, intervalMs)

    return () => window.clearInterval(intervalId)
  }, [images.length, intervalMs])

  const wrapperClassName = ['relative', 'overflow-hidden', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapperClassName}>
      {images.map((src, index) => {
        const isActive = index === activeIndex

        return (
          <Image
            key={src}
            src={src}
            alt={`Athlete highlight ${index + 1}`}
            fill
            sizes="100vw"
            className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${
              isActive ? 'opacity-100' : 'opacity-0'
            } ${imageClassName ?? 'object-cover object-center'}`}
            priority={index === 0}
            draggable={false}
          />
        )
      })}
    </div>
  )
}

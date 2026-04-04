'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type HeroVideoClip = {
  src: string
  maxSeconds?: number
}

type HeroVideoCarouselProps = {
  clips: HeroVideoClip[]
  className?: string
}

const FADE_MS = 560

export default function HeroVideoCarousel({ clips, className }: HeroVideoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [fadingOutIndex, setFadingOutIndex] = useState<number | null>(null)
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([])
  const switchingRef = useRef(false)
  const fadeTimeoutRef = useRef<number | null>(null)
  const readyTimeoutRef = useRef<number | null>(null)
  const clipTimeoutRef = useRef<number | null>(null)

  const clearFadeTimeout = () => {
    if (fadeTimeoutRef.current !== null) {
      window.clearTimeout(fadeTimeoutRef.current)
      fadeTimeoutRef.current = null
    }
  }

  const clearReadyTimeout = () => {
    if (readyTimeoutRef.current !== null) {
      window.clearTimeout(readyTimeoutRef.current)
      readyTimeoutRef.current = null
    }
  }

  const clearClipTimeout = () => {
    if (clipTimeoutRef.current !== null) {
      window.clearTimeout(clipTimeoutRef.current)
      clipTimeoutRef.current = null
    }
  }

  const playClip = useCallback((index: number) => {
    const video = videoRefs.current[index]
    if (!video) return Promise.resolve()
    video.currentTime = 0
    // Proactively start fetching the next clip in the background so it has
    // the full duration of the current clip to buffer before it's needed.
    const nextIndex = (index + 1) % clips.length
    const nextVideo = videoRefs.current[nextIndex]
    if (nextVideo && nextVideo.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      nextVideo.load()
    }
    return video.play().catch(() => null)
  }, [clips.length])

  const stopClip = useCallback((index: number) => {
    const video = videoRefs.current[index]
    if (!video) return
    video.pause()
    video.currentTime = 0
  }, [])

  const advance = useCallback(() => {
    if (clips.length < 2 || switchingRef.current) return
    switchingRef.current = true

    const previousIndex = activeIndex
    const nextIndex = (activeIndex + 1) % clips.length

    const beginTransition = () => {
      setFadingOutIndex(previousIndex)
      setActiveIndex(nextIndex)

      clearFadeTimeout()
      fadeTimeoutRef.current = window.setTimeout(() => {
        stopClip(previousIndex)
        setFadingOutIndex(null)
        switchingRef.current = false
      }, FADE_MS)
    }

    const nextVideo = videoRefs.current[nextIndex]
    if (!nextVideo) {
      switchingRef.current = false
      return
    }

    const startNext = () => {
      clearReadyTimeout()
      void playClip(nextIndex)
      // Start the fade on the next frame instead of waiting on play()
      // resolution. Some mobile browsers delay that promise even after the
      // video is ready, which leaves the last frame "stuck" on screen.
      window.requestAnimationFrame(() => beginTransition())
    }

    const cleanupListeners = () => {
      nextVideo.removeEventListener('loadeddata', handleReady)
      nextVideo.removeEventListener('canplay', handleReady)
      nextVideo.removeEventListener('error', handleReady)
    }

    const handleReady = () => {
      cleanupListeners()
      startNext()
    }

    // HAVE_FUTURE_DATA (>= 3) means the browser has data beyond the current
    // position — safe to play without immediate stalling on mobile.
    if (nextVideo.readyState >= 3) {
      startNext()
      return
    }

    nextVideo.addEventListener('loadeddata', handleReady)
    nextVideo.addEventListener('canplay', handleReady)
    nextVideo.addEventListener('error', handleReady)

    // Some mobile browsers are inconsistent about firing readiness events for
    // background videos. If that happens, advance anyway instead of freezing
    // on the current frame.
    clearReadyTimeout()
    readyTimeoutRef.current = window.setTimeout(() => {
      cleanupListeners()
      startNext()
    }, 1200)
  }, [activeIndex, clips.length, playClip, stopClip])

  useEffect(() => {
    if (!clips.length) return
    videoRefs.current.forEach((video, index) => {
      if (!video || index === 0) return
      video.load()
    })
    void playClip(0)
    return () => {
      clearFadeTimeout()
      clearReadyTimeout()
      clearClipTimeout()
    }
  }, [clips.length, playClip])

  useEffect(() => {
    if (!clips.length) return
    clearClipTimeout()
    if (clips.length < 2) return
    const activeClip = clips[activeIndex]
    const activeVideo = videoRefs.current[activeIndex]
    const fallbackSeconds = 6
    const clipSeconds = activeClip.maxSeconds && activeClip.maxSeconds > 0
      ? activeClip.maxSeconds
      : activeVideo?.duration && Number.isFinite(activeVideo.duration) && activeVideo.duration > 0
        ? activeVideo.duration
        : fallbackSeconds

    clipTimeoutRef.current = window.setTimeout(() => {
      if (!switchingRef.current) {
        advance()
      }
    }, Math.max(clipSeconds * 1000 + 250, 1500))

    return () => {
      clearClipTimeout()
    }
  }, [activeIndex, advance, clips])

  if (!clips.length) return null

  const wrapperClassName = ['relative', 'overflow-hidden', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapperClassName}>
      {clips.map((clip, index) => {
        const isActive = index === activeIndex
        const isFading = index === fadingOutIndex
        const opacityClass = isActive ? 'opacity-100' : 'opacity-0'

        return (
          <video
            key={clip.src}
            ref={(node) => {
              videoRefs.current[index] = node
            }}
            src={clip.src}
            muted
            playsInline
            preload="auto"
            className={`absolute inset-0 h-full w-full object-cover object-center will-change-[opacity] transition-opacity duration-[560ms] ease-in-out ${opacityClass} ${
              isFading ? 'z-20' : isActive ? 'z-10' : 'z-0'
            }`}
            onEnded={() => {
              if (index !== activeIndex) return
              if (!clip.maxSeconds) {
                advance()
              }
            }}
            onTimeUpdate={() => {
              if (index !== activeIndex || switchingRef.current) return
              if (!clip.maxSeconds || clip.maxSeconds <= 0) return
              const video = videoRefs.current[index]
              if (!video) return
              if (video.currentTime >= clip.maxSeconds) {
                advance()
              }
            }}
          />
        )
      })}
    </div>
  )
}

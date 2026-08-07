'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const resolveAppStoreUrl = () => {
  const value = process.env.NEXT_PUBLIC_APP_STORE_URL?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    const isAppleDownloadHost = url.hostname === 'apps.apple.com' || url.hostname === 'testflight.apple.com'
    return url.protocol === 'https:' && isAppleDownloadHost ? url.toString() : null
  } catch {
    return null
  }
}

const APP_STORE_URL = resolveAppStoreUrl()

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 814 1000"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46.7 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.6-49.5 190.5-49.5 30.8 0 133.3 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
    </svg>
  )
}

export default function GetTheAppButton({
  beforeOpen,
  className = '',
  label = 'Get the app',
  variant = 'default',
}: {
  beforeOpen?: () => void
  className?: string
  label?: string
  variant?: 'default' | 'footer'
} = {}) {
  const [open, setOpen] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handleClick = () => {
    beforeOpen?.()
    // On touch devices go straight to the App Store; desktop shows the QR modal
    if (APP_STORE_URL && typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
      window.location.assign(APP_STORE_URL)
    } else {
      setOpen(true)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`${variant === 'footer'
          ? 'inline-flex w-max items-center border-0 bg-transparent p-0 text-sm font-normal text-[#cfcfcf] shadow-none transition-colors hover:text-white'
          : 'inline-flex items-center gap-2 rounded-full border border-[#d7d7d7] bg-white px-5 py-2.5 text-sm font-semibold text-[#191919] shadow-[0_4px_16px_rgba(25,25,25,0.08)] transition hover:shadow-[0_6px_20px_rgba(25,25,25,0.13)]'
        } ${className}`}
      >
        {variant !== 'footer' ? <AppleLogo className="h-[15px] w-[15px] shrink-0" /> : null}
        {label}
      </button>

      {open && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === overlayRef.current) setOpen(false) }}
        >
          <div className="relative max-h-[calc(100svh-2rem)] w-full max-w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-[#e0e0e0] bg-white p-4 shadow-2xl sm:p-5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f3f3] text-xs text-[#4a4a4a] hover:bg-[#e8e8e8]"
              aria-label="Close"
            >
              ✕
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#191919]">
                <AppleLogo className="h-6 w-6 text-white" />
              </div>
              <div className="mt-3 text-xl font-semibold leading-tight text-[#191919]">Download Coaches Hive</div>

              <div className="mt-4 flex items-center justify-center rounded-xl border border-[#e0e0e0] bg-[#f7f7f7] p-3">
                {APP_STORE_URL ? (
                  <a
                    href={APP_STORE_URL}
                    aria-label="Open the Coaches Hive listing in the App Store"
                    className="rounded-lg bg-white p-2 focus:outline-none focus:ring-2 focus:ring-[#b80f0a]"
                  >
                    <QRCodeSVG
                      value={APP_STORE_URL}
                      size={160}
                      level="H"
                      marginSize={1}
                      title="Scan to download Coaches Hive from the App Store"
                    />
                  </a>
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center">
                    <p className="text-sm text-[#9a9a9a]">QR code coming soon</p>
                  </div>
                )}
              </div>
              {APP_STORE_URL ? (
                <>
                  <a
                    href={APP_STORE_URL}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#191919] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#333]"
                    aria-label="Download Coaches Hive from the App Store"
                  >
                    <AppleLogo className="h-[15px] w-[15px] shrink-0" />
                    View on the App Store
                  </a>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

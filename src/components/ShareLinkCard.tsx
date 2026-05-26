'use client'

import { useEffect, useState } from 'react'

type ShareLinkCardProps = {
  path: string
  description?: string
}

export default function ShareLinkCard({ path, description }: ShareLinkCardProps) {
  const [refCode, setRefCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    setOrigin(window.location.origin)
    fetch('/api/referrals')
      .then((res) => res.json())
      .then((data) => {
        if (data?.code) setRefCode(data.code)
      })
      .catch(() => null)
  }, [])

  const fullLink = origin && path ? `${origin}${path}${refCode ? `?ref=${refCode}` : ''}` : ''

  const handleCopy = async () => {
    if (!fullLink) return
    try {
      await navigator.clipboard.writeText(fullLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      const input = document.createElement('input')
      input.value = fullLink
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={fullLink || 'Loading…'}
          className="min-w-0 flex-1 rounded-full border border-[#dcdcdc] bg-[#f5f5f5] px-4 py-2.5 text-sm text-[#4a4a4a] outline-none"
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          onClick={handleCopy}
          disabled={!fullLink}
          className="shrink-0 rounded-full border border-[#191919] px-4 py-2.5 text-sm font-semibold text-[#191919] transition-colors hover:bg-[#191919] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
      <p className="text-xs text-[#6b6b6b]">
        {description ?? 'Share this link so people can find and book you directly.'}
      </p>
    </div>
  )
}

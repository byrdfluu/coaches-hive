'use client'

import { QRCodeSVG } from 'qrcode.react'

export default function AppStoreQrCode({ appStoreUrl }: { appStoreUrl: string }) {
  return (
    <div className="mx-auto mt-8 hidden max-w-xs rounded-3xl border border-[#d9d9d9] bg-[#f7f6f4] p-6 md:block">
      <a
        href={appStoreUrl}
        className="inline-flex rounded-2xl bg-white p-3 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#b80f0a] focus:ring-offset-2"
        aria-label="Open the Coaches Hive listing in the App Store"
      >
        <QRCodeSVG
          value={appStoreUrl}
          size={184}
          level="H"
          marginSize={1}
          fgColor="#191919"
          bgColor="#ffffff"
          title="Scan to download Coaches Hive from the App Store"
        />
      </a>
      <p className="mt-4 text-sm font-semibold text-[#191919]">Scan with your iPhone</p>
      <p className="mt-1 text-xs leading-5 text-[#6b6b6b]">Download Coaches Hive directly from the App Store.</p>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    setInstalled(window.matchMedia('(display-mode: standalone)').matches)
    setIsIos(/iPhone|iPad|iPod/i.test(navigator.userAgent))
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Coaches Hive is installed on this device.</p>
  if (prompt) return <button type="button" onClick={async () => { await prompt.prompt(); await prompt.userChoice }} className="w-full rounded-full bg-[#b80f0a] px-6 py-3 font-semibold text-white">Install Coaches Hive</button>
  if (isIos) return <p className="rounded-2xl bg-[#f7f6f4] p-4 text-sm text-[#4a4a4a]">On iPhone or iPad, open this page in <strong>Safari</strong>, tap Share, then choose <strong>Add to Home Screen</strong>.</p>
  return <p className="rounded-2xl bg-[#f7f6f4] p-4 text-sm text-[#4a4a4a]">On Android, open the Chrome menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
}

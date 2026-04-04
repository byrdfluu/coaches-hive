'use client'

import type React from 'react'
import { BrandThemeProvider } from '@/components/brand-theme'
import { AthleteAccessProvider } from '@/components/AthleteAccessProvider'
import { AthleteProfileProvider } from '@/components/AthleteProfileContext'

const defaultTheme = {
  primary: '#191919',
  accent: '#b80f0a',
  background: '#e8e8e8',
  logo: '/CHLogoTransparent.PNG',
  coachName: 'Coach Hive',
}

export default function AthleteProviders({ children }: { children: React.ReactNode }) {
  const theme = defaultTheme

  return (
    <BrandThemeProvider theme={theme}>
      <AthleteAccessProvider>
        <AthleteProfileProvider>
        <div
          className="min-h-screen"
          style={
            {
              '--brand-primary': theme.primary,
              '--brand-accent': theme.accent,
              '--brand-bg': theme.background,
              '--brand-logo': `url(${theme.logo})`,
              backgroundColor: 'var(--brand-bg)',
            } as React.CSSProperties
          }
        >
          {children}
        </div>
        </AthleteProfileProvider>
      </AthleteAccessProvider>
    </BrandThemeProvider>
  )
}

'use client'

import { createContext, useContext } from 'react'

type BrandTheme = {
  primary: string
  accent: string
  background: string
  logo: string
  coachName: string
}

const defaultTheme: BrandTheme = {
  primary: '#191919',
  accent: '#b80f0a',
  background: '#e8e8e8',
  logo: '/CHLogoTransparent.PNG',
  coachName: 'Coach Hive',
}

const BrandThemeContext = createContext<BrandTheme>(defaultTheme)

export function BrandThemeProvider({
  theme,
  children,
}: {
  theme: BrandTheme
  children: React.ReactNode
}) {
  return <BrandThemeContext.Provider value={theme}>{children}</BrandThemeContext.Provider>
}

export function useBrandTheme() {
  return useContext(BrandThemeContext)
}
